$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$archive = Join-Path $root '.deploy-serverlegends.tgz'
$remoteScriptFile = Join-Path $root '.deploy-serverlegends-remote.sh'
$remoteArchive = '/home/ubuntu/serverlegends-deploy.tgz'
$remoteScriptPath = '/home/ubuntu/serverlegends-deploy-remote.sh'
$remoteDir = '/home/ubuntu/serverlegends-deploy'
$tarExe = 'C:\Windows\System32\tar.exe'
$scpExe = 'C:\Windows\System32\OpenSSH\scp.exe'
$sshExe = 'C:\Windows\System32\OpenSSH\ssh.exe'

function ConvertTo-BashSingleQuoted([string] $Value) {
  $replacement = "'" + '"' + "'" + '"' + "'"
  return "'" + $Value.Replace("'", $replacement) + "'"
}

if (-not (Test-Path (Join-Path $root '.env'))) {
  throw 'Brak pliku .env w katalogu projektu.'
}

Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
  }
}

foreach ($required in 'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID') {
  if (-not [System.Environment]::GetEnvironmentVariable($required)) {
    throw "Brakuje wartosci $required w .env"
  }
}

if (Test-Path $archive) {
  Remove-Item -LiteralPath $archive -Force
}

if (Test-Path $remoteScriptFile) {
  Remove-Item -LiteralPath $remoteScriptFile -Force
}

Write-Host 'Pakowanie repo...'
& $tarExe -C $root -czf $archive --exclude=node_modules --exclude=.git --exclude=.env --exclude=.deploy-serverlegends.tgz .

Write-Host 'Wysylanie archiwum na bosman...'
& $scpExe $archive "bosman:$remoteArchive"

$discordToken = [System.Environment]::GetEnvironmentVariable('DISCORD_TOKEN')
$clientId = [System.Environment]::GetEnvironmentVariable('CLIENT_ID')
$guildId = [System.Environment]::GetEnvironmentVariable('GUILD_ID')
$discordTokenBash = ConvertTo-BashSingleQuoted $discordToken
$clientIdBash = ConvertTo-BashSingleQuoted $clientId
$guildIdBash = ConvertTo-BashSingleQuoted $guildId

$remoteScript = @"
set -e
rm -rf $remoteDir
mkdir -p $remoteDir
tar -xzf $remoteArchive -C $remoteDir
cd $remoteDir
CURRENT_DB_URL=`$(sudo kubectl get secret serverlegends-secret -n serverlegends -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
sudo kubectl -n serverlegends create secret generic serverlegends-secret --from-literal=DISCORD_TOKEN=$discordTokenBash --from-literal=CLIENT_ID=$clientIdBash --from-literal=GUILD_ID=$guildIdBash --from-literal=NODE_ENV='production' --from-literal=DATABASE_URL="`$CURRENT_DB_URL" --dry-run=client -o yaml | sudo kubectl apply -f -
sudo docker build -t serverlegends-bot:latest .
sudo docker save serverlegends-bot:latest -o /tmp/serverlegends-bot.tar
sudo k3s ctr images import /tmp/serverlegends-bot.tar
sudo kubectl apply -f $remoteDir/k8s/serverlegends-bot.yaml
sudo kubectl rollout restart deployment/serverlegends-bot -n serverlegends
sudo kubectl rollout status deployment/serverlegends-bot -n serverlegends --timeout=180s
POD=`$(sudo kubectl get pod -n serverlegends -l app=serverlegends-bot -o jsonpath='{.items[0].metadata.name}')
set +e
sudo kubectl exec -n serverlegends `$POD -- node src/deploy-commands.js
DEPLOY_COMMANDS_STATUS=`$?
set -e
if [ "`$DEPLOY_COMMANDS_STATUS" -ne 0 ]; then echo 'UWAGA: deploy aplikacji zakonczyl sie poprawnie, ale rejestracja komend Discord nie powiodla sie.'; echo 'Najczestsza przyczyna: bot nie ma dostepu do guilda z GUILD_ID albo token/CLIENT_ID/GUILD_ID nie naleza do tej samej aplikacji.'; fi
"@

[System.IO.File]::WriteAllText($remoteScriptFile, ($remoteScript -replace "`r", ''), [System.Text.UTF8Encoding]::new($false))

Write-Host 'Budowanie i rollout na bosman...'
& $scpExe $remoteScriptFile "bosman:$remoteScriptPath" | Out-Null
& $sshExe bosman "bash $remoteScriptPath; rm -f $remoteScriptPath"

Write-Host 'Deploy zakonczony.'
