/** Manual, one-shot Telegram test in an approved clone using the B11 request journal. */
function B11_telegramApprovedCloneTest() {
  const properties = PropertiesService.getScriptProperties();
  const enabledKey = 'B11_TELEGRAM_TEST_ENABLED';
  const approvalKey = 'B11_TELEGRAM_TEST_APPROVAL';
  if (properties.getProperty(enabledKey) !== 'true') return {state: 'OFF'};

  const approvalText = properties.getProperty(approvalKey);
  let approval;
  try {
    approval = JSON.parse(approvalText);
  } catch (_) {
    throw Error('TELEGRAM_TEST_APPROVAL_REQUIRED');
  }
  const expiry = approval && Date.parse(approval.expiresAt);
  if (!approval || approval.approved !== true || !Number.isFinite(expiry) || expiry <= Date.now() ||
      typeof approval.id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(approval.id) ||
      typeof approval.botId !== 'string' || !/^[1-9][0-9]*$/.test(approval.botId) ||
      typeof approval.chatSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(approval.chatSha256)) {
    throw Error('TELEGRAM_TEST_APPROVAL_REQUIRED');
  }

  const store = HousingB11GasStore.create({
    approved: true, mode: 'MOCK_ONLY', projectId: approval.projectId,
    sheetId: approval.sheetId, blockedOperatingSheetId: approval.blockedOperatingSheetId
  });
  const token = properties.getProperty('B11_TELEGRAM_TEST_BOT_TOKEN') || '';
  const chatId = properties.getProperty('B11_TELEGRAM_TEST_CHAT_ID') || '';
  if (!/^[1-9][0-9]*:[A-Za-z0-9_-]{20,}$/.test(token) || token.split(':')[0] !== approval.botId ||
      !/^[1-9][0-9]*$/.test(chatId) || !Number.isSafeInteger(Number(chatId)) ||
      HousingB11GasStore.hash(chatId) !== approval.chatSha256) {
    throw Error('TELEGRAM_TEST_RECIPIENT_CONFIG_MISMATCH');
  }

  const requestId = 'TELEGRAM_TEST:' + approval.id;
  const text = '주택공고 알림 연결 시험 메시지입니다.';
  const claim = store.transaction(state => {
    const previous = state.requests[requestId];
    if (previous) return {claimed: false, state: previous.state};
    state.requests[requestId] = {
      id: requestId, kind: 'TELEGRAM_TEST', state: 'REQUEST_STARTED',
      createdAt: new Date().toISOString(), payloadHash: HousingB11GasStore.hash(text)
    };
    return {claimed: true};
  });
  if (!claim.claimed) return {state: claim.state, requestId, reusedApproval: true};

  const authorized = properties.getProperty(enabledKey) === 'true' &&
      properties.getProperty(approvalKey) === approvalText && expiry > Date.now();
  const outcome = authorized ? B11_sendTelegramTest_(token, chatId, text) : {state: 'CANCELLED'};

  try {
    store.transaction(state => {
      const request = state.requests[requestId];
      if (!request || request.kind !== 'TELEGRAM_TEST' || request.state !== 'REQUEST_STARTED') {
        throw Error('TELEGRAM_TEST_REQUEST_STATE_CONFLICT');
      }
      Object.assign(request, outcome, {completedAt: new Date().toISOString()});
    });
  } catch (_) {
    return {state: 'UNKNOWN_DELIVERY', requestId, reason: 'JOURNAL_COMMIT_UNCERTAIN'};
  }
  return {state: outcome.state, requestId};
}

function B11_sendTelegramTest_(token, chatId, text) {
  try {
    const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      payload: JSON.stringify({chat_id: chatId, text: text, disable_notification: true})
    });
    const status = response.getResponseCode();
    if (status >= 500) return {state: 'UNKNOWN_DELIVERY'};
    const body = JSON.parse(response.getContentText());
    const message = body && body.result;
    if (status === 200 && body && body.ok === true && message &&
        Number.isSafeInteger(message.message_id) && message.message_id > 0 &&
        Number.isSafeInteger(message.date) && message.date > 0 &&
        message.chat && message.chat.type === 'private' && String(message.chat.id) === chatId) {
      return {state: 'DELIVERED', messageId: message.message_id, serverTimestamp: message.date};
    }
    if (status >= 400 && status < 500 && body && body.ok === false && body.error_code === status) {
      return {state: 'API_REJECTED', errorCode: status};
    }
  } catch (_) {
    // The request may have reached Telegram. Keep the approval consumed.
  }
  return {state: 'UNKNOWN_DELIVERY'};
}
