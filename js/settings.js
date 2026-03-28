// ========================================
// 설정 페이지 함수 (Firebase 연동)
// ========================================

function updateSettingsGrid() {
    let html = '';
    
    const sortedDates = Object.keys(maxCapacity).sort();
    
    sortedDates.forEach(dateStr => {
        html += `
            <div class="date-setting-card">
                <div class="date-setting-card-header">${formatDateForCard(dateStr)}</div>
                <div class="date-setting-card-content">
                    <div class="date-input-group">
                        <input type="number" id="capacity-${dateStr}" value="${maxCapacity[dateStr]}" min="1">
                        <button onclick="updateDateCapacity('${dateStr}')">변경</button>
                    </div>
                    <button class="date-setting-remove" onclick="removeDateSetting('${dateStr}')">삭제</button>
                </div>
            </div>
        `;
    });

    html += `
        <div class="add-date-setting" onclick="addDateSetting()">
            <div style="font-size: 28px; margin-bottom: 8px;">+</div>
            <div>일자 추가</div>
        </div>
    `;

    document.getElementById('settingsGrid').innerHTML = html;
}

function formatDateForCard(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

// 📌 새 날짜 설정 추가 (Firebase 저장)
async function addDateSetting() {
    const dateStr = prompt('날짜를 입력하세요 (YYYY-MM-DD 형식):');
    if (!dateStr) return;

    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) {
        alert('올바른 날짜 형식이 아닙니다. (YYYY-MM-DD)');
        return;
    }

    if (maxCapacity[dateStr]) {
        alert('이미 설정된 날짜입니다.');
        return;
    }

    // 날짜 유효성 검사
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) {
        alert('유효하지 않은 날짜입니다.');
        return;
    }

    maxCapacity[dateStr] = defaultMaxCapacity;
    
    try {
        await saveSettingToFirebase(dateStr, defaultMaxCapacity);
        updateSettingsGrid();
        renderCalendar();
        alert('새 날짜가 추가되었습니다');
    } catch (error) {
        console.error('설정 추가 실패:', error);
        alert('설정 추가 중 오류가 발생했습니다');
        delete maxCapacity[dateStr];
    }
}

// 📌 날짜별 최대 인원 변경 (Firebase 저장)
async function updateDateCapacity(dateStr) {
    const value = parseInt(document.getElementById(`capacity-${dateStr}`).value);
    
    if (isNaN(value) || value < 1) {
        alert('최소 1명 이상이어야 합니다');
        return;
    }

    const leaveCount = Object.keys(leaves[dateStr] || {}).length;
    if (leaveCount > value) {
        alert(`현재 등록된 연가자(${leaveCount}명)가 변경하려는 인원(${value}명)보다 많습니다`);
        return;
    }

    try {
        await saveSettingToFirebase(dateStr, value);
        renderCalendar();
        alert('변경되었습니다');
    } catch (error) {
        console.error('설정 변경 실패:', error);
        alert('설정 변경 중 오류가 발생했습니다');
    }
}

// 📌 날짜 설정 삭제 (Firebase 삭제)
async function removeDateSetting(dateStr) {
    if (confirm('이 날짜 설정을 삭제하시겠습니까?')) {
        try {
            await deleteSettingFromFirebase(dateStr);
            updateSettingsGrid();
            renderCalendar();
            alert('삭제되었습니다');
        } catch (error) {
            console.error('설정 삭제 실패:', error);
            alert('설정 삭제 중 오류가 발생했습니다');
        }
    }
}
