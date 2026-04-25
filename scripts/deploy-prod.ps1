$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$archive = Join-Path $root '.deploy-serverlegends.tgz'
$remoteScriptFile = Join-Path $root '.deploy-serverlegends-remote.sh'
$tarExe = 'C:\Windows\System32\tar.exe'
$scpExe = 'C:\Windows\System32\OpenSSH\scp.exe'
$sshExe = 'C:\Windows\System32\OpenSSH\ssh.exe'

function ConvertTo-BashSingleQuoted([string] $Value) {
  $replacement = "'" + '"' + "'" + '"' + "'"
  return "'" + $Value.Replace("'", $replacement) + "'"
}

if (-not (Test-Path (Join-Path $root '.env'))) {
  throw 'Missing .env file in the project directory.'
}

Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
  }
}

function Get-DeployEnv([string] $Name, [string] $Default = '') {
  $value = [System.Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }
  return $value
}

foreach ($required in 'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DEPLOY_DATABASE_URL') {
  if (-not [System.Environment]::GetEnvironmentVariable($required)) {
    throw "Missing $required value in .env"
  }
}

$deployHost = Get-DeployEnv 'DEPLOY_HOST'
if (-not $deployHost) {
  throw 'Missing DEPLOY_HOST in .env, for example DEPLOY_HOST=user@your-server or DEPLOY_HOST=your-ssh-alias'
}

$remoteDir = Get-DeployEnv 'DEPLOY_REMOTE_DIR' '/home/ubuntu/serverlegends-deploy'
$remoteArchive = Get-DeployEnv 'DEPLOY_REMOTE_ARCHIVE' "$remoteDir.tgz"
$remoteScriptPath = Get-DeployEnv 'DEPLOY_REMOTE_SCRIPT' "$remoteDir-remote.sh"
$namespace = Get-DeployEnv 'K8S_NAMESPACE' 'serverlegends'
$secretName = Get-DeployEnv 'K8S_SECRET_NAME' 'serverlegends-secret'
$deploymentName = Get-DeployEnv 'K8S_DEPLOYMENT_NAME' 'serverlegends-bot'
$appLabel = Get-DeployEnv 'K8S_APP_LABEL' 'serverlegends-bot'
$imageName = Get-DeployEnv 'DOCKER_IMAGE' 'serverlegends-bot:latest'
$kubectlCmd = Get-DeployEnv 'DEPLOY_KUBECTL_CMD' 'sudo kubectl'
$dockerCmd = Get-DeployEnv 'DEPLOY_DOCKER_CMD' 'sudo docker'
$imageImportCmd = Get-DeployEnv 'DEPLOY_IMAGE_IMPORT_CMD' 'sudo k3s ctr images import'
$skipImageImport = (Get-DeployEnv 'DEPLOY_SKIP_IMAGE_IMPORT' 'false').ToLowerInvariant() -in @('1', 'true', 'yes')

if (Test-Path $archive) {
  Remove-Item -LiteralPath $archive -Force
}

if (Test-Path $remoteScriptFile) {
  Remove-Item -LiteralPath $remoteScriptFile -Force
}

Write-Host 'Packaging repo...'
& $tarExe -C $root -czf $archive --exclude=node_modules --exclude=.git --exclude=.env --exclude=.deploy-serverlegends.tgz --exclude=.deploy-serverlegends-remote.sh .

Write-Host "Uploading archive to $deployHost..."
& $scpExe $archive "${deployHost}:$remoteArchive"

$discordToken = [System.Environment]::GetEnvironmentVariable('DISCORD_TOKEN')
$clientId = [System.Environment]::GetEnvironmentVariable('CLIENT_ID')
$guildId = [System.Environment]::GetEnvironmentVariable('GUILD_ID')
$deployDatabaseUrl = Get-DeployEnv 'DEPLOY_DATABASE_URL'
$discordTokenBash = ConvertTo-BashSingleQuoted $discordToken
$clientIdBash = ConvertTo-BashSingleQuoted $clientId
$guildIdBash = ConvertTo-BashSingleQuoted $guildId
$deployDatabaseUrlBash = ConvertTo-BashSingleQuoted $deployDatabaseUrl
$remoteDirBash = ConvertTo-BashSingleQuoted $remoteDir
$remoteArchiveBash = ConvertTo-BashSingleQuoted $remoteArchive
$namespaceBash = ConvertTo-BashSingleQuoted $namespace
$secretNameBash = ConvertTo-BashSingleQuoted $secretName
$deploymentNameBash = ConvertTo-BashSingleQuoted $deploymentName
$appLabelBash = ConvertTo-BashSingleQuoted $appLabel
$imageNameBash = ConvertTo-BashSingleQuoted $imageName
$imageTarBash = ConvertTo-BashSingleQuoted "/tmp/$($imageName.Replace(':', '-').Replace('/', '-')).tar"
$skipImageImportBash = if ($skipImageImport) { 'true' } else { 'false' }

$remoteScript = @"
set -e
REMOTE_DIR=$remoteDirBash
REMOTE_ARCHIVE=$remoteArchiveBash
NAMESPACE=$namespaceBash
SECRET_NAME=$secretNameBash
DEPLOYMENT_NAME=$deploymentNameBash
APP_LABEL=$appLabelBash
IMAGE_NAME=$imageNameBash
IMAGE_TAR=$imageTarBash

rm -rf "`$REMOTE_DIR"
mkdir -p "`$REMOTE_DIR"
tar -xzf "`$REMOTE_ARCHIVE" -C "`$REMOTE_DIR"
cd "`$REMOTE_DIR"
DATABASE_URL_VALUE=$deployDatabaseUrlBash
$kubectlCmd create namespace "`$NAMESPACE" --dry-run=client -o yaml | $kubectlCmd apply -f -
$kubectlCmd -n "`$NAMESPACE" create secret generic "`$SECRET_NAME" --from-literal=DISCORD_TOKEN=$discordTokenBash --from-literal=CLIENT_ID=$clientIdBash --from-literal=GUILD_ID=$guildIdBash --from-literal=NODE_ENV='production' --from-literal=DATABASE_URL="`$DATABASE_URL_VALUE" --dry-run=client -o yaml | $kubectlCmd apply -f -
$dockerCmd build -t "`$IMAGE_NAME" .
$dockerCmd save "`$IMAGE_NAME" -o "`$IMAGE_TAR"
if [ "$skipImageImportBash" != "true" ]; then
  $imageImportCmd "`$IMAGE_TAR"
fi
cat > "`$REMOTE_DIR/k8s/.deploy-rendered.yaml" <<YAML
apiVersion: v1
kind: Namespace
metadata:
  name: `$NAMESPACE
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: `$DEPLOYMENT_NAME
  namespace: `$NAMESPACE
spec:
  replicas: 1
  selector:
    matchLabels:
      app: `$APP_LABEL
  template:
    metadata:
      labels:
        app: `$APP_LABEL
    spec:
      containers:
        - name: bot
          image: `$IMAGE_NAME
          imagePullPolicy: IfNotPresent
          envFrom:
            - secretRef:
                name: `$SECRET_NAME
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
YAML
$kubectlCmd apply -f "`$REMOTE_DIR/k8s/.deploy-rendered.yaml"
$kubectlCmd rollout restart "deployment/`$DEPLOYMENT_NAME" -n "`$NAMESPACE"
$kubectlCmd rollout status "deployment/`$DEPLOYMENT_NAME" -n "`$NAMESPACE" --timeout=180s
POD=`$($kubectlCmd get pod -n "`$NAMESPACE" -l "app=`$APP_LABEL" -o jsonpath='{.items[0].metadata.name}')
$kubectlCmd exec -n "`$NAMESPACE" `$POD -- node -e 'const fs = require("fs"); const { Pool } = require("pg"); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const sql = fs.readFileSync("src/db/schema.sql", "utf8"); pool.query(sql).then(() => pool.end()).catch(err => { console.error(err); process.exit(1); });'
set +e
$kubectlCmd exec -n "`$NAMESPACE" `$POD -- node src/deploy-commands.js
DEPLOY_COMMANDS_STATUS=`$?
set -e
if [ "`$DEPLOY_COMMANDS_STATUS" -ne 0 ]; then echo 'WARNING: app deploy completed, but Discord command registration failed.'; echo 'Most common cause: the bot cannot access the guild from GUILD_ID, or DISCORD_TOKEN/CLIENT_ID/GUILD_ID do not belong to the same application.'; fi
"@

[System.IO.File]::WriteAllText($remoteScriptFile, ($remoteScript -replace "`r", ''), [System.Text.UTF8Encoding]::new($false))

Write-Host "Building and rolling out on $deployHost..."
& $scpExe $remoteScriptFile "${deployHost}:$remoteScriptPath" | Out-Null
& $sshExe $deployHost "bash $remoteScriptPath; rm -f $remoteScriptPath"

Write-Host 'Deploy completed.'
