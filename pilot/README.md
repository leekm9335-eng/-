# 실제 실행 3건

## 소스 준비

`bash pilot/assemble.sh /path/to/new-housing-pilot`을 실행합니다. 기존 통합본의 SHA-256을 확인한 뒤 필요한 참조 코드와 의존성을 가져와, 이 배포본과 실행 코드 전체를 한 폴더에 구성합니다. 생성 폴더에서 아래 명령을 실행합니다.

## P0 현황판

- 입력은 최신 운영 `Code.gs`와 `appsscript.json`의 읽기 전용 내보내기입니다. SHA-256과 소스 차이를 확인하고 패치를 현행 버전에 맞춥니다. `prepare-clone.cjs`에 고정된 SHA는 **보관 원본 전용**입니다.
- 승인 대상은 격리된 Apps Script 프로젝트, 복제 시트와 수동 워커 실행입니다. 복제 시트의 보호 필드와 공고 ID를 먼저 비교 기준으로 읽습니다. 기존 주기로 `P0_runApprovedCloneWorker()`를 호출해 단계 순환, 공고판정·사용자현황판 정상 시각 전진, 보호 필드와 공고 ID 보존을 확인합니다. 운영 반영은 별도 승인입니다.

## P1 공식 공고 한 건

- 승인 대상은 Work 전용 Apps Script 프로젝트와 실행 API 배포, 전용 Drive 테스트 폴더·marker, 해당 폴더 쓰기 및 중앙 테스트 원장 적재입니다. `work-mvp/`의 GAS 번들과 매니페스트 예시로 배포합니다. `housing53MvpConfig()`의 저장 설정은 승인할 때까지 OFF입니다.
- 2026-11-18 SOCO 공식 목록과 상세가 HTTP 200이었고, 기존 파서가 `SOCO_YOUTH:BMSR00015:6732`를 모집공고로 분류했습니다. 실행 직전에 목록에서 대상을 확인하고 `source: 'SOCO'`, `page: 1`, 새 `captureId`, `noticeKeys: ['SOCO_YOUTH:BMSR00015:6732']`, `maxNotices: 1`로 시작합니다. 가장 작은 실증은 `maxAttachments: 0`으로 목록·상세만 저장합니다.
- 승인된 저장 설정은 `mode: 'LIVE_TEST'`, `writeEnabled: true`, `testFolderId`, `allowedTestFolderIds: [TEST_FOLDER_ID]`, `markerFileId`, `expectedScriptId`, `confirmation: 'TEST_STORE_ONLY_NO_OPERATIONAL_WRITES'`입니다. 폴더 이름은 `Housing53_TEST_`로 시작하고 marker의 `purpose`, `namespace`, 폴더·스크립트 ID가 전용 환경과 일치해야 합니다.

```bash
# 승인된 실행 API용 사용자 OAuth 액세스 토큰을 HOUSING_GAS_ACCESS_TOKEN으로 로컬에서 설정
node bridge/tools/gas-mvp.cjs run ./central-test pilot/hold-test-baseline.json ./run-first.json APPROVED_DEPLOYMENT_ID
node pilot/verify-p1.cjs ./central-test ./run-first.json SOCO_YOUTH:BMSR00015:6732
```

검증 명령은 보고서의 상세 스냅샷·커밋 참조가 중앙 테스트 원장의 동일 공고 HOLD에 연결됐는지 확인합니다. 같은 Work 캡처로 별도 응답 파일에 다시 실행하면 저장된 상세의 재사용을 확인할 수 있습니다. 파일에 OAuth 토큰을 저장하지 않습니다.

## P2 단일 시험 수신

기존 `b11/scripts/HousingB11_CloneWithTelegramTest.gs`를 유지합니다. 승인 대상은 복제 프로젝트·B11 원장, 봇·개인 시험 채팅, 단일 발송입니다. 설정은 프로젝트의 Script Properties에서만 주입하고 승인 전 OFF로 둡니다. 승인 뒤 `B11_telegramApprovedCloneTest()`를 한 번 실행해 원장의 전송 결과와 개인 채팅 수신을 확인합니다. 운영 알림 활성화는 모집회차·기준선 연동 후 별도 승인입니다.
