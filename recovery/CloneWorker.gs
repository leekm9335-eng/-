/** Manual tick for the isolated build produced by prepare-clone.cjs. */
function P0_runApprovedCloneWorker() {
  assertApprovedHousing42A3Clone_();
  const p = PropertiesService.getScriptProperties();
  const read = () => ({
    phase: p.getProperty('DERIVED_STEP42A') || '0',
    wait: p.getProperty('DERIVED_WAIT42A'),
    decisionAt: p.getProperty('DERIVED_OK42A_공고판정'),
    regionAt: p.getProperty('DERIVED_OK42A_지역정책'),
    dashboardAt: p.getProperty('DERIVED_OK42A_사용자현황판'),
    dashboardPublishedAt: p.getProperty('USER_DASHBOARD4'),
    workerAt: p.getProperty('WORKER_OK4')
  });
  const before = read();
  runEnrichmentV4();
  const result = {before: before, after: read()};
  console.log(JSON.stringify(result));
  return result;
}

function assertApprovedHousing42A3Clone_() {
  const properties = PropertiesService.getScriptProperties();
  if (ScriptApp.getScriptId() !== HOUSING42A3_CLONE_PROJECT_ID ||
      properties.getProperty('HOUSING42A3_CLONE_WORKER_APPROVED') !== SPREADSHEET_ID) {
    throw Error('HOUSING42A3_CLONE_APPROVAL_REQUIRED');
  }
  if (ScriptApp.getProjectTriggers().length) throw Error('HOUSING42A3_CLONE_MANUAL_ONLY');
}
