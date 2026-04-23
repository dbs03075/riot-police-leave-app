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

---

## 📸 미리보기 (Preview)

*(상세한 UI 디자인은 실제 배포된 사이트에서 확인할 수 있습니다.)*
- **메인 화면**: 깔끔한 다크/라이트 모드 지원 캘린더
- **관리자 모드**: 체크박스와 가변 셀렉트 박스를 통한 빠른 일정 등록
- **모달 UI**: Glassmorphism 디자인이 적용된 세련된 인터페이스

---

## ⚖️ License
Copyright © 2024 dbs03075. All rights reserved.
