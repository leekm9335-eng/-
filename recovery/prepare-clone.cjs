'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');

const HISTORICAL_SHA = 'f4e74d924868f98953d45e31e33c73c80724ef09c2e6dddb4dabfdadd0b9bef6';
const WORKER = 'function runEnrichmentV42(e){';
const TARGET = /^const SPREADSHEET_ID\s*=\s*['"]([A-Za-z0-9_-]+)['"];$/gm;

function prepare(sourcePath, out, projectId, sheetId) {
  for (const id of [projectId, sheetId]) {
    if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw Error('CLONE_PROJECT_AND_SHEET_IDS_REQUIRED');
  }
  const source = fs.readFileSync(sourcePath);
  if (createHash('sha256').update(source).digest('hex') !== HISTORICAL_SHA) {
    throw Error('42A3_SOURCE_DIFFERS_REVIEW_AND_REBASE_PATCH_FIRST');
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'housing42a3-'));
  let candidate;
  try {
    const codePath = path.join(temp, 'Code.gs');
    fs.writeFileSync(codePath, source);
    execFileSync('git', ['apply', '--', path.join(__dirname, 'P0-42A3-historical.patch')], {cwd: temp});
    candidate = fs.readFileSync(codePath, 'utf8');
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }

  const targets = [...candidate.matchAll(TARGET)];
  if (targets.length !== 1 || targets[0][1] === sheetId || candidate.split(WORKER).length !== 2) {
    throw Error('CLONE_TARGET_OR_WORKER_MISMATCH');
  }

  const guard = fs.readFileSync(path.join(__dirname, 'CloneWorker.gs'), 'utf8');
  const code = candidate
    .replace(TARGET, () => 'const SPREADSHEET_ID=' + JSON.stringify(sheetId) + ';')
    .replace(WORKER, WORKER + '\n assertApprovedHousing42A3Clone_();');
  fs.mkdirSync(out, {mode: 0o700});
  fs.writeFileSync(path.join(out, 'Code.gs'), code, {mode: 0o600});
  fs.writeFileSync(path.join(out, 'CloneWorker.gs'),
    'const HOUSING42A3_CLONE_PROJECT_ID=' + JSON.stringify(projectId) + ';\n' + guard, {mode: 0o600});
  fs.writeFileSync(path.join(out, 'appsscript.json'), JSON.stringify({
    timeZone: 'Asia/Seoul', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER'
  }, null, 2) + '\n', {mode: 0o600});
}

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 4) throw Error('Usage: node recovery/prepare-clone.cjs HISTORICAL_CODE_GS NEW_OUTPUT_DIR CLONE_PROJECT_ID CLONE_SHEET_ID');
    prepare(...args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
