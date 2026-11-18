'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {FileStore} = require('../b11/src/FileStore.cjs');
const {readResult} = require('../bridge/src/GasMvpResult.cjs');
const {stable} = require('../b11/src/DeliveryCore.js');

const [directory, capture, key] = process.argv.slice(2);
if (!directory || !capture || !key || process.argv.length !== 5) {
  console.error('Usage: node pilot/verify-p1.cjs TEST_LEDGER_DIR CAPTURE_JSON EXPECTED_SOURCE_NOTICE_KEY');
  process.exit(2);
}

const {run, records, provenance} = readResult(fs.readFileSync(capture, 'utf8'));
assert.equal(run?.schema, 'HA53_MVP_RUN_V1', 'Work execution report required');
assert.equal(records.length, 1, 'Expected exactly one staged detail');
assert.equal(records[0].original.sourceNoticeKey, key, 'Unexpected official notice');
assert.match(records[0].original.sourceResponseSha256, /^[a-f0-9]{64}$/i, 'Missing official response hash');
assert.ok(!records[0].holdReasons.some(reason => reason.startsWith('SOURCE_CLASSIFICATION_')), 'Detail is not a recruitment notice');

const central = new FileStore(path.join(directory, 'central.json')).read();
const matches = Object.values(central.v04Handoffs || {}).filter(entry =>
  entry.sourceNoticeKey === key && entry.decision === 'HOLD' &&
  entry.eventEmissionAllowed === false && stable(entry.original) === stable(records[0]) &&
  Object.values(entry.mvpProvenance || {}).some(proof => stable(proof) === stable(provenance[0]))
);
assert.equal(matches.length, 1, 'No unique matching HOLD receipt in the central test ledger');

const delivery = new FileStore(path.join(directory, 'delivery.json')).read();
assert.equal(Object.keys(delivery.events).length, 0, 'Test ledger contains delivery events');
console.log(JSON.stringify({
  sourceNoticeKey: key, decision: matches[0].decision,
  detailSnapshotId: provenance[0].detailSnapshotId, detailCommitRef: provenance[0].detailCommitRef,
  requests: run.requests, newDetailObservations: run.newDetailObservations, deliveryEvents: 0
}));
