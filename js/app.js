// ========================================
// 앱 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('✓ 앱 준비 완료');
    console.log('📍 현재 상태: Firebase 설정 대기 중...');
});

// 상단 헤더 제대 변경 
function changeUnit(unit) {
    selectedUnit = unit;
    console.log(`✓ '${unit}' 선택됨`);

    // 실시간 동기화 재설정 (내부에서 기존 구독 해제 및 renderCalendar 호출)
    setupRealtimeSync();
}
