'use strict';

const REPORT_SCHEMA = 'HA53_MVP_RUN_V1';
const HANDOFF_SCHEMA = 'HA53_CANONICAL_HANDOFF_V1';
const SHA256 = /^[0-9a-f]{64}$/i;
const DETAIL_ID = /^mvp_detail_[a-f0-9]{40}$/;
const LIST_ID = /^mvp_list_[a-f0-9]{40}$/;
const SOURCES = new Map([
  ['SOCO', 'SOCO_YOUTH'], ['HUG_NOTICE', 'HUG_NOTICE'], ['NANUM', 'NANUM'],
  ['ONEROOF', 'ONEROOF'], ['MZIP', 'MZIP'], ['PAJU', 'PAJU'], ['UUC', 'UUC']
]);

function decode(value) {
  let result = typeof value === 'string' ? JSON.parse(value) : value;
  if (result && (Object.hasOwn(result, 'done') || Object.hasOwn(result, 'response'))) {
    if (result.done !== true || result.error || !result.response ||
        !Object.hasOwn(result.response, 'result')) throw Error('GAS_MVP_EXECUTION_RESULT_REQUIRED');
    result = result.response.result;
  }
  return result;
}

function validateHandoff(record) {
  const source = record?.original;
  if (!record || record.schema !== HANDOFF_SCHEMA || record.disposition !== 'HOLD' ||
      record.eventEmissionAllowed !== false || record.deliveryCapability !== 'NONE' ||
      !source || typeof source.sourceNoticeKey !== 'string' || !source.sourceNoticeKey.trim() ||
      typeof source.observationSha256 !== 'string' || !SHA256.test(source.observationSha256) ||
      !Array.isArray(record.holdReasons)) throw Error('GAS_MVP_HANDOFF_INVALID');
}

function readResult(value) {
  const result = decode(value);
  if (Array.isArray(result)) {
    // The read-only housing53MvpCanonical() function returns an array without run metadata.
    result.forEach(validateHandoff);
    return {records: result, provenance: [], run: null};
  }

  const {source, captureId, page, status, complete, list, details, canonical, errors} = result || {};
  if (result?.schema !== REPORT_SCHEMA || result.deliveryCapability !== 'NONE' ||
      !SOURCES.has(source) || typeof captureId !== 'string' || !captureId ||
      !Number.isSafeInteger(page) || page < 1 || typeof status !== 'string' || !status ||
      typeof complete !== 'boolean' || !Array.isArray(errors) ||
      !Array.isArray(details) || !Array.isArray(canonical) || canonical.length !== details.length ||
      (list === null ? details.length !== 0 : !LIST_ID.test(list?.snapshotId) || !SHA256.test(list?.commitRef))) {
    throw Error('GAS_MVP_REPORT_INVALID');
  }

  const byKey = new Map();
  for (const detail of details) {
    const {sourceNoticeKey, snapshotId, commitRef} = detail || {};
    if (typeof sourceNoticeKey !== 'string' || !sourceNoticeKey.startsWith(SOURCES.get(source) + ':') ||
        !DETAIL_ID.test(snapshotId) || !SHA256.test(commitRef) || byKey.has(sourceNoticeKey)) {
      throw Error('GAS_MVP_DETAIL_INVALID');
    }
    byKey.set(sourceNoticeKey, {snapshotId, commitRef});
  }

  const provenance = canonical.map(record => {
    validateHandoff(record);
    const {sourceNoticeKey, snapshotId} = record.original;
    const detail = byKey.get(sourceNoticeKey);
    if (!detail || detail.snapshotId !== snapshotId) throw Error('GAS_MVP_DETAIL_BINDING');
    byKey.delete(sourceNoticeKey);
    return {
      source, captureId, page, listSnapshotId: list.snapshotId, listCommitRef: list.commitRef,
      detailSnapshotId: detail.snapshotId, detailCommitRef: detail.commitRef
    };
  });

  return {records: canonical, provenance, run: {
    schema: REPORT_SCHEMA, source, captureId, page, status, complete, errorCount: errors.length,
    requests: result.requests, newListObservations: result.newListObservations,
    newDetailObservations: result.newDetailObservations
  }};
}

module.exports = {readResult};
