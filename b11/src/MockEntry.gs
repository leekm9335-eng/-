/* No automatic execution. The clone variant requires separate user approval. */
function B11_mockApprovedClone(config, canonicalRows, baseline) {
  const store = HousingB11GasStore.create(config);
  const models = new HousingB11.ModelRepository(canonicalRows);
  const adapter = HousingB11.createMockAdapter();
  const sender = HousingB11.engine({
    mode: 'MOCK_ONLY', store: store, models: models, adapter: adapter,
    hash: HousingB11GasStore.hash,
    recipient: {kind: 'PERSONAL', count: 1, scope: 'SELF'}
  });
  sender.freezeBaseline(baseline);
  const ingest = sender.ingest(canonicalRows);
  // One bounded attempt; no loop, trigger creation or network adapter.
  const dispatch = sender.dispatchOne();
  return {mode: 'MOCK_ONLY', ingest: ingest, dispatch: dispatch,
    mockRequests: adapter.calls().length, realTelegramRequests: 0};
}
