# 🛡️ 기동대 연가 관리 시스템 (Riot Police Leave Management System)

![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?style=for-the-badge&logo=github&logoColor=white)

> **"효율적이고 투명한 부대 연가 관리를 위한 실시간 스마트 캘린더 플랫폼"**

본 프로젝트는 부대 내 복잡한 연가/외출/당직 일정을 실시간으로 공유하고, 팀별 인원 제한 및 직급 순 정렬을 통해 체계적으로 관리할 수 있도록 설계된 웹 어플리케이션입니다.

---

## ✨ 주요 기능 (Key Features)

### 🗓️ 실시간 스마트 캘린더
- **실시간 동기화**: Firebase Firestore를 연동하여 기기 간 데이터가 초단위로 동기화됩니다.
- **다이나믹 배지**: 연가, 교육, 병가, 당직 등 사유별로 색상화된 배지를 통해 한눈에 일정을 파악합니다.
- **팀별 그룹화**: 같은 팀원끼리 묶어서 표시하며, 설정된 **연번(Hierarchy)**에 따라 자동으로 정렬됩니다.

### 👥 팀 및 인원 관리
- **정밀 인원 제한**: 일별 최대 연가 가능 인원을 설정하고, 당직 인원을 제외한 순수 연가자 수를 실시간 계산합니다.
- **팀 메모 기능**: 각 날짜별로 팀별 할당량이나 특이사항을 메모로 남길 수 있습니다.
- **관리자 전용 모달**: 일괄 신청, 사유 수정, 인원 조정 등 강력한 관리 도구를 제공합니다.

### 📑 스마트 리포트 (자세히 보기)
- **텍스트 자동 생성**: 복사-붙여넣기에 최적화된 형식으로 오늘의 연가/당직 현황을 팀 순서 및 직급 순으로 정리해 줍니다.
- **비밀번호 기반 권한**: 간단한 인증을 통해 관리자와 일반 사용자의 접근 권한을 분리합니다.

---

## 🛠 기술 스택 (Tech Stack)

| 구분 | 기술 | 비고 |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JS, HTML5, CSS3 | 프레임워크 없는 순수 웹 기술로 가볍고 빠름 |
| **Backend** | Firebase Firestore/Auth | 실시간 데이터베이스 및 인증 서비스 |
| **Deployment** | GitHub Actions | `main` 브랜치 푸시 시 자동 배포 및 시크릿 주입 |

---

## 🚀 시작하기 (Setup)

### 1. 시크릿 설정 (GitHub Secrets)
자동 배포를 위해 GitHub Repository 설정에서 다음 시크릿을 등록해야 합니다:
- `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` 등 (Firebase 콘솔 확인)

### 2. 로컬 실행
```bash
# 저장소 복제
git clone https://github.com/dbs03075/riot-police-leave-app.git

# index.html을 브라우저로 실행
```

### 3. Blaze 전환 및 텔레그램 서버 설정

`/todayleaves`를 입력하면 1·2·3제대의 당일 연가자 현황을 답장하며, 설정 화면의 정기 전송 시간에는 웹 화면이 닫혀 있어도 서버가 당일 현황을 보냅니다.

1. Firebase Console에서 프로젝트를 연 뒤 **업그레이드(Upgrade)** → **Blaze**를 선택하고 Cloud Billing 계정을 연결합니다. 이어서 Billing의 **예산 및 알림**에서 작은 금액(예: 1달러) 알림을 만드세요. 예산 알림은 사용을 자동으로 차단하지 않으므로, 사용량도 함께 확인해야 합니다.
2. Firebase CLI로 로그인하고 `functions` 폴더에서 의존성을 설치합니다.
   ```bash
   ```bash
   firebase login
   cd functions
   npm install
   cd ..
   ```

3. 다음 세 개의 서버 시크릿을 등록합니다. `TELEGRAM_ALLOWED_CHAT_ID`에는 명령을 허용하고 정기 전송을 받을 텔레그램 그룹 ID를 넣습니다.

   ```bash
   firebase functions:secrets:set TELEGRAM_BOT_TOKEN --project <FIREBASE_PROJECT_ID>
   firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET --project <FIREBASE_PROJECT_ID>
   firebase functions:secrets:set TELEGRAM_ALLOWED_CHAT_ID --project <FIREBASE_PROJECT_ID>
   ```

   웹훅 시크릿은 영문 대·소문자, 숫자, `_`, `-`만 사용해 1~256자로 만드세요.

4. 명령 웹훅과 정기 전송 함수를 함께 배포합니다.

   ```bash
   firebase deploy --only functions:telegramWebhook,functions:sendScheduledDailyLeaves --project <FIREBASE_PROJECT_ID>
   ```

5. 출력된 함수 URL을 텔레그램 웹훅으로 등록합니다. 아래 `<FUNCTION_URL>`은 배포 결과의 URL로 교체합니다.

   ```bash
   curl.exe -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -d "url=<FUNCTION_URL>" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d "allowed_updates=[\"message\"]"
   ```

이후 허용한 그룹에서 `/todayleaves`를 입력하면 봇이 당일 현황을 답장합니다. 설정 화면에서 정기 전송 시간을 지정하면 그 값이 Firestore에 저장되고 서버가 한국 시간 기준으로 매일 한 번 전송합니다. 다른 명령이나 허용되지 않은 채팅 ID의 메시지는 무시합니다.

이 구성은 Cloud Scheduler 작업 1개만 사용합니다. Scheduler는 Google 계정당 작업 3개까지 무료 할당량이 있고, 이 앱은 하루 1,440회 설정 문서를 읽습니다. Firestore 무료 일일 읽기 한도(50,000회)와 Cloud Functions 무료 월간 호출 한도(2,000,000회)보다 충분히 낮습니다. 다만 무료 한도 초과와 함수 컨테이너 저장 용량에는 과금될 수 있으므로 예산 알림을 유지하세요.

---

## 📸 미리보기 (Preview)

*(상세한 UI 디자인은 실제 배포된 사이트에서 확인할 수 있습니다.)*
- **메인 화면**: 깔끔한 다크/라이트 모드 지원 캘린더
- **관리자 모드**: 체크박스와 가변 셀렉트 박스를 통한 빠른 일정 등록
- **모달 UI**: Glassmorphism 디자인이 적용된 세련된 인터페이스

---

## ⚖️ License
Copyright © 2026 dbs03075. All rights reserved.
