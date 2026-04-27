#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');

const projectRoot = path.resolve(__dirname, '../..');
const backupsDir = path.join(projectRoot, 'backups');

function parseArgs(argv) {
  const args = { mode: 'auto', keep: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--docker') args.mode = 'docker';
    else if (arg === '--direct') args.mode = 'direct';
    else if (arg === '--keep') args.keep = parseInt(argv[++i], 10);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node src/scripts/backup.js [options]

Options:
  --direct        Force pg_dump on the host (requires pg_dump in PATH).
  --docker        Force docker compose exec on the "postgres" service.
  --keep <N>      Keep only the N newest backups in ./backups (older are deleted).
  -h, --help      Show this help.

Default (auto): use docker mode if DATABASE_URL host equals "postgres", otherwise direct.`);
      process.exit(0);
    }
  }
  return args;
}

function hasDockerComposePostgres() {
  const composePath = path.join(projectRoot, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return false;
  const contents = fs.readFileSync(composePath, 'utf8');
  return /^\s{2}postgres:\s*$/m.test(contents);
}

function resolveMode(explicitMode, databaseUrl) {
  if (explicitMode !== 'auto') return explicitMode;
  try {
    const url = new URL(databaseUrl);
    if (url.hostname === 'postgres') return 'docker';
  } catch { /* fall through */ }
  if (hasDockerComposePostgres()) return 'docker';
  return 'direct';
}

function buildDumpProcess(mode, databaseUrl) {
  const dumpArgs = ['--no-owner', '--no-privileges', '--clean', '--if-exists'];

  if (mode === 'docker') {
    return spawn(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'pg_dump', databaseUrl, ...dumpArgs],
      { cwd: projectRoot }
    );
  }

  return spawn('pg_dump', [databaseUrl, ...dumpArgs]);
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function pruneOldBackups(keep) {
  if (!Number.isFinite(keep) || keep <= 0) return;
  const files = fs.readdirSync(backupsDir)
    .filter(name => name.startsWith('serverlegends-') && name.endsWith('.sql.gz'))
    .map(name => ({ name, path: path.join(backupsDir, name), mtime: fs.statSync(path.join(backupsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(keep)) {
    fs.unlinkSync(file.path);
    console.log(`Pruned old backup: ${file.name}`);
  }
}

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Configure it in .env first.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const mode = resolveMode(args.mode, databaseUrl);

  fs.mkdirSync(backupsDir, { recursive: true });
  const outFile = path.join(backupsDir, `serverlegends-${timestamp()}.sql.gz`);

  console.log(`Backing up database (mode=${mode}) to ${outFile}`);

  const dump = buildDumpProcess(mode, databaseUrl);
  let stderrBuffer = '';
  dump.stderr.on('data', chunk => { stderrBuffer += chunk.toString(); });
  dump.on('error', err => {
    console.error(`Failed to spawn ${mode === 'docker' ? 'docker compose' : 'pg_dump'}: ${err.message}`);
    if (mode === 'direct' && err.code === 'ENOENT') {
      console.error('Hint: install pg_dump (PostgreSQL client tools) or use --docker if Postgres runs in docker compose.');
    }
    process.exit(1);
  });

  const writeStream = fs.createWriteStream(outFile);
  try {
    await pipeline(dump.stdout, zlib.createGzip(), writeStream);
  } catch (err) {
    fs.rmSync(outFile, { force: true });
    console.error(`Backup pipeline failed: ${err.message}`);
    if (stderrBuffer) console.error(stderrBuffer.trim());
    process.exit(1);
  }

  const exitCode = await new Promise(resolve => dump.on('close', resolve));
  if (exitCode !== 0) {
    fs.rmSync(outFile, { force: true });
    console.error(`pg_dump exited with code ${exitCode}`);
    if (stderrBuffer) console.error(stderrBuffer.trim());
    process.exit(exitCode || 1);
  }

  const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
  console.log(`Backup complete: ${path.basename(outFile)} (${sizeMb} MB)`);

  if (args.keep) pruneOldBackups(args.keep);
})();
