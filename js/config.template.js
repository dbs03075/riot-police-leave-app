// ========================================
// Firebase 설정 및 전역 변수
// ========================================
// ⚠️  이 파일은 템플릿입니다.
// 실제 값은 GitHub Actions Secrets에서 자동으로 주입됩니다.
// 로컬 개발 시에는 js/config.js 파일을 별도로 생성하세요.

const firebaseConfig = {
    apiKey: "%%FIREBASE_API_KEY%%",
    authDomain: "%%FIREBASE_AUTH_DOMAIN%%",
    projectId: "%%FIREBASE_PROJECT_ID%%",
    storageBucket: "%%FIREBASE_STORAGE_BUCKET%%",
    messagingSenderId: "%%FIREBASE_MESSAGING_SENDER_ID%%",
    appId: "%%FIREBASE_APP_ID%%",
    measurementId: "%%FIREBASE_MEASUREMENT_ID%%"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 전역 변수
let currentUser = null;
let leaves = {};
let maxCapacity = {};
let teamQuotas = {};
let employees = [];  // DB에서 로드됨

// 제대(Unit) 설정
const units = ['1제대', '2제대', '3제대'];
let selectedUnit = '1제대';

const leaveReasons = [
    { value: 'annual', label: '연가', color: '#0066CC' },
    { value: 'special', label: '특별휴가', color: '#00A86B' },
    { value: 'education', label: '교육', color: '#FF9800' },
    { value: 'sick', label: '병가', color: '#E74C3C' },
    { value: 'out_of_area_travel', label: '관외', color: '#0066CC' },
    { value: 'personal_duty', label: '개인당직', color: '#92400e' },
    { value: 'personal_rest', label: '당직휴무', color: '#92400e' },
    { value: 'multi_rest', label: '다당휴무', color: '#831843' },
    { value: 'multi_duty', label: '다목적당직', color: '#7c2d12' },
    { value: 'compensatory_rest', label: '대체휴무', color: '#831843' },
];

const defaultMaxCapacity = 3;
let selectedDate = null;
let currentDate = new Date();
let selectedReason = 'annual';

// 📌 Firebase Firestore 구조 (자동 생성됨)
// employees/
//   ├── {uid}/
//   │   ├── email: "user@example.com"
//   │   ├── name: "김철수"
//   │   ├── role: "admin" 또는 "employee"
//   │   └── createdAt: timestamp
//
// leaves/
//   ├── {date}/
//   │   ├── date: "2026-03-08"
//   │   ├── employees: { "김철수": "annual", "이영희": "special" }
//   │   └── updatedAt: timestamp
//
// settings/
//   └── maxCapacity/
//       ├── "2026-03-10": 3
//       ├── "2026-03-15": 2
//       └── ...
