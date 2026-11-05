# IntegrationBridge v0.2 / Work v0.4 전달용 패키지

[전체 개발 ZIP 다운로드](./Housing_IntegrationBridge_Work_v04_full_20261105.zip?raw=true)

약23MB. ZIP 파일 페이지의 Download raw file로 저장한 뒤 일반 ChatGPT 채팅에 첨부하세요.

- 실행: ZIP 전체를 풀고 `node bridge/tools/e2e-v04.cjs`
- 소스 브랜치: feature/5.2b-bridge-work-v04
- 소스 커밋: 1e0d92dad4df3b58880b59989cab28bade826da6
- SHA-256: `a546635d7319acfcf456d156601298e86bd83168f3fabba5318342877245bbda`
- 신규 통합45, 기존bridge56, A6 420, B133, Work386 로컬 회귀 통과
- 성공 입력은 합성 확정 사례. 실제 인계5개는 원래 HOLD/null round 그대로 보존.
- 운영 NO-GO. A6 현황판 복구는 최우선 미검증 과제. Work 실제 GAS 저장 실증도 독립 미완료.

실제 Google·사용자 시트·속성·트리거·토큰·Telegram을 변경하지 않았습니다. 이 브랜치는 ZIP 전달 전용이며 운영 배포가 아닙니다.
