// ========================================
// 앱 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('✓ 앱 준비 완료');
    console.log('📍 현재 상태: Firebase 설정 대기 중...');
});

// Enter 키로 로그인
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
        login();
    }
});

// 상단 헤더 제대 변경 
function changeUnit(unit) {
    selectedUnit = unit;
    console.log(`✓ '${unit}' 선택됨`);
    
    // 데이터 새로 로드 -> 모달이 열려있으면 업데이트
    loadEmployeesFromDB().then(() => {
        if (document.getElementById('adminView').style.display === 'block') {
            renderEmployeeList();
        }
    });
    
    // 실시간 동기화 재설정 (내부에서 기존 구독 해제 및 renderCalendar 호출)
    setupRealtimeSync();
}
