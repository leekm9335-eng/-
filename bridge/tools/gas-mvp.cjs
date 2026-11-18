'use strict';

const fs = require('node:fs');
const {create} = require('../src/NodePipelineV04.cjs');
const {readResult} = require('../src/GasMvpResult.cjs');

async function captureRun(deployment, file) {
  const token = process.env.HOUSING_GAS_ACCESS_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{20,}$/.test(deployment)) {
    throw Error('GAS_MVP_DEPLOYMENT_AND_ACCESS_TOKEN_REQUIRED');
  }

  // Reserve the one-run capture path before invoking Apps Script.
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    let response;
    try {
      response = await fetch('https://script.googleapis.com/v1/scripts/' + deployment + ':run', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
        body: JSON.stringify({function: 'housing53MvpRun', devMode: false}),
        redirect: 'error',
        signal: AbortSignal.timeout(390000)
      });
    } catch {
      throw Error('GAS_MVP_RUN_STATUS_UNKNOWN');
    }
    if (!response.ok) throw Error('GAS_MVP_HTTP_' + response.status);

    const operation = await response.text();
    fs.writeFileSync(fd, operation);
    fs.fsyncSync(fd);
    const value = JSON.parse(operation);
    if (value.done !== true || value.error || !value.response ||
        !Object.hasOwn(value.response, 'result') || !readResult(value).run) throw Error('GAS_MVP_EXECUTION_RESULT_REQUIRED');
    return value;
  } finally {
    fs.closeSync(fd);
  }
}

async function main(args) {
  const [mode, dir, baselineFile, resultFile, deployment] = args;
  if (!dir || !baselineFile || !resultFile ||
      !((mode === 'import' && args.length === 4) || (mode === 'run' && args.length === 5))) {
    throw Error('Usage: node bridge/tools/gas-mvp.cjs import|run LEDGER_DIR BASELINE_JSON RESULT_JSON [DEPLOYMENT_ID]');
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const pipeline = create({dir, baseline, clock: Date.now});
  const result = mode === 'run' ? await captureRun(deployment, resultFile) : fs.readFileSync(resultFile, 'utf8');
  const {run, receipts} = pipeline.receiveGasMvpResult(result);
  console.log(JSON.stringify({run, received: receipts.length, receipts}));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {captureRun};
