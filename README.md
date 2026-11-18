# Housing 복구·GAS 연동 코드

운영 반영 0회, 실제 Apps Script 복제 실행 0회, 실제 텔레그램 발송 0회.

## P0 현황판

`recovery/P0-42A3-historical.patch`는 통합 ZIP 안의 `baseline/local6/full.zip`에서 꺼낸 `baseline/Code.gs.txt`에 적용됩니다. 최신 운영 파일이 제공되면 변경점을 비교한 뒤 패치를 맞춰야 합니다.

```sh
node recovery/prepare-clone.cjs HISTORICAL_CODE_GS NEW_OUTPUT_DIR CLONE_PROJECT_ID CLONE_SHEET_ID
```

생성되는 `Code.gs`, `CloneWorker.gs`, `appsscript.json`은 독립 복제 프로젝트용입니다. 승인 후 복제 프로젝트의 Script Properties에 `HOUSING42A3_CLONE_WORKER_APPROVED` 값을 복제 시트 ID로 설정하고, `P0_runApprovedCloneWorker`를 수동 실행합니다. 호출마다 전후 파생 단계와 마지막 정상 시각을 반환합니다. 기존 실행 간격·커서·예산으로 여러 번 관측합니다.

## P1 Work MVP와 중앙 원장

[기존 A6·B mock·Work v0.4 통합 ZIP](https://github.com/leekm9335-eng/-/raw/ffdd6052fcafe0446c6b3279548b3a74f3c1e864/Housing_IntegrationBridge_Work_v04_full_20261105.zip)의 루트에 이 패키지의 `bridge/` 파일을 덮어씁니다. 기존 A6 참조 원본과 v0.4 의존성은 그 통합 ZIP에서 읽습니다. 새 수집기의 GAS 코드와 매니페스트 예시는 `work-mvp/`에 있습니다.

```sh
node bridge/tools/gas-mvp.cjs import LEDGER_DIR BASELINE_JSON RUN_OR_CANONICAL_JSON
node bridge/tools/gas-mvp.cjs run LEDGER_DIR BASELINE_JSON NEW_CAPTURE_JSON APPROVED_API_DEPLOYMENT_ID
```

`import`는 `housing53MvpRun()`의 전체 보고서, Apps Script 실행 API 응답 또는 `housing53MvpCanonical()`이 반환한 배열을 받습니다. `run`은 승인된 독립 Work 프로젝트의 실행 API 배포와 `HOUSING_GAS_ACCESS_TOKEN` 환경변수에 사용자 OAuth 액세스 토큰을 필요로 합니다. 사용 중인 중앙 원장의 기존 승인 baseline JSON을 사용합니다. 보고서의 커밋 참조와 원본 인계는 `central.json`에 저장됩니다. 공고 판정에 필요한 기존 독립 근거가 없는 인계는 HOLD 상태로 유지됩니다.

## P2 B11 텔레그램 단일 시험

복제 프로젝트에 `b11/scripts/HousingB11_CloneWithTelegramTest.gs`를 사용합니다. 기존 B11 소스·번들과 중복 추가하면 안 됩니다. 기존 형식의 `_B11_JOURNAL` 탭이 필요합니다. 기본값은 OFF입니다. 승인 후에만 `B11_TELEGRAM_TEST_ENABLED=true`로 설정합니다. `B11_TELEGRAM_TEST_APPROVAL`은 `approved`, `id`, `expiresAt`, `botId`, `chatSha256`, `projectId`, `sheetId`, `blockedOperatingSheetId` 필드를 받습니다. `chatSha256`은 개인 채팅 ID 문자열의 SHA-256입니다. `B11_TELEGRAM_TEST_BOT_TOKEN`과 `B11_TELEGRAM_TEST_CHAT_ID`는 복제 프로젝트의 Script Properties로만 설정합니다. 수동 함수는 `B11_telegramApprovedCloneTest`입니다.

## 실행 결과

- P0 보관본 패치 적용·구문·복제대상 바인딩 확인. 모의 실행에서 네 단계 순환 확인.
- P1 첨부 MVP 10개와 기존 Bridge v0.4 45개 통과. 첨부 소스로 생성한 7개 수집처 보고서를 기존 원장에 HOLD 저장. SOCO 실행 재생 중복 0건, 상세 참조 불일치는 거절, 알림 이벤트 0건.
- P2 기존 B11 133개 통과. 통합 번들 모의 실행에서 OFF일 때 원장 접근 0회. 시험 전송 전 요청 상태 저장, 시험 결과 저장, 동일 승인 ID의 재호출 차단 확인.
