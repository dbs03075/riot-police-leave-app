# 아이디 로그인·회원가입 배포 안내

이 버전은 기존 Firestore 월별·제대별 데이터 구조를 유지하면서, 인증과 일정 저장을 Cloud Functions에서 검증합니다. 정적 웹만 먼저 배포하면 로그인이 동작하지 않으므로 아래 순서대로 배포해야 합니다.

## 1. 사전 확인

- Firebase Authentication에서 이메일/비밀번호 로그인이 활성화되어 있어야 합니다.
- 새 계정은 Authentication UID와 같은 ID의 `employees/{uid}` 문서로 생성됩니다.
- `employees.email`과 `employees.username`은 중복되지 않아야 합니다.
- `role`은 `admin` 또는 `employee`, `unit`은 `1제대`, `2제대`, `3제대` 중 하나여야 합니다.
- 텔레그램을 사용한다면 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID` Secret이 등록되어 있어야 합니다.

## 2. 서버 및 보안 규칙 배포

프로젝트 루트에서 다음을 실행합니다.

```powershell
Set-Location functions
npm install
Set-Location ..
firebase deploy --only "functions:registerEmployee,functions:activateUsername,functions:getCurrentUserProfile,functions:updateEmployeeProfile,functions:deleteEmployee,functions:saveLeaveChanges,functions:updateTelegramSchedule,functions:telegramClientNotification,functions:telegramWebhook,functions:sendScheduledDailyLeaves,functions:sendScheduledDailyLeavesV2,firestore:rules" --project leave-management-app-2c39c
```

보안 규칙을 먼저 배포하면 기존 프론트의 저장이 막힙니다. 반드시 Functions·규칙·웹 코드를 같은 작업 창에서 배포합니다.

## 3. 기존 Authentication 계정 전환

현재 Authentication에 있는 기존 계정은 삭제하지 않습니다. 사용자가 로그인 화면의 `기존 계정` 탭에서 다음을 1회 입력합니다.

1. 기존 Authentication 이메일
2. 기존 비밀번호
3. 앞으로 사용할 아이디

연결이 끝나면 Authentication 계정의 로그인 이메일은 내부용 아이디 주소로 변경되지만, `employees.email`의 실제 연락처는 유지됩니다.

## 4. 웹 배포

`main` 브랜치에 반영하면 GitHub Actions가 `index.html`, `css`, `js`만 GitHub Pages에 배포합니다. Firebase 및 텔레그램 서버 Secret은 브라우저 파일에 포함되지 않습니다.

## 5. 운영 전 점검

1. 신규 일반 제대원 회원가입 후 Authentication과 `employees/{uid}`가 함께 생성되는지 확인
2. 기존 관리자 계정의 아이디 연결 및 재로그인 확인
3. 일반 직원 계정으로 로그인, 본인 연가 신청 및 취소 확인
2. 관리자 계정으로 타 직원 일정 변경, 정원 및 팀 메모 변경 확인
3. 같은 날짜의 마지막 한 자리를 두 계정에서 동시에 신청해 한 계정만 성공하는지 확인
4. 같은 직원 일정을 두 관리자 화면에서 다르게 수정해 나중 저장이 충돌 안내를 표시하는지 확인
5. 변경 이력과 텔레그램 변경 알림 확인
6. 비로그인 상태에서 Firestore 데이터 조회와 일정 쓰기가 거부되는지 확인

초기 배포는 소수 계정으로 위 항목을 확인한 뒤 전체 약 90명에게 확대하는 것을 권장합니다.
