// ========================================
// 모달 관련 함수
// ========================================

function onReasonChange(value) {
    selectedReason = value;
    const detailInput = document.getElementById('detailReasonInput');
    if (detailInput) {
        const reqDetail = ['special', 'education', 'sick', 'compensatory_rest', 'leave_early_late', 'etc'].includes(value);
        detailInput.style.display = reqDetail ? 'block' : 'none';
        if (!reqDetail) detailInput.value = '';
    }
}

function openModal() {
    if (!selectedDate) return;
    
    // ⚠️ 편집 시작 시점의 원본 데이터를 깊복사해서 보관 (영화관 예약처럼 변경 사항만 반영하기 위함)
    const currentData = leaves[selectedDate] || {};
    originalLeaves = JSON.parse(JSON.stringify(currentData));
    editingLeaves = JSON.parse(JSON.stringify(currentData));
    
    isModalEditing = true;

    // 상위 날짜 표시
    const date = new Date(selectedDate + 'T00:00:00');
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    const dateStr = date.toLocaleDateString('ko-KR', options);
    document.getElementById('modalDateTitle').textContent = dateStr;

    // 어드민인지 일반 유저인지 보고 각 화면 띄어줌
    if (currentUser && currentUser.role === 'admin') {
        showAdminView();
    } else {
        showEmployeeView();
    }

    document.getElementById('leaveModal').classList.add('active');
}

function closeModal() {
    document.getElementById('leaveModal').classList.remove('active');
    isModalEditing = false; // ⚠️ 편집 모드 종료
    selectedDate = null;
}

function showAdminView() {
    document.getElementById('adminView').style.display = 'block';
    document.getElementById('employeeView').style.display = 'none';

    document.getElementById('employeeSearch').value = '';
    document.getElementById('employeeSearch').addEventListener('input', filterEmployees);

    // DB에서 로드한 직원 목록으로 렌더링
    renderEmployeeList(); //leave-management.js에 있음
    updateLeaveItems(); //leave-management.js에 있음
}

function showEmployeeView() {
    document.getElementById('adminView').style.display = 'none';
    document.getElementById('employeeView').style.display = 'block';

    // 휴가 사유 선택 UI
    let reasonHtml = '';
    leaveReasons.forEach(reason => {
        reasonHtml += `
            <label class="reason-option">
                <input type="radio" name="leaveReason" value="${reason.value}" ${selectedReason === reason.value ? 'checked' : ''} onchange="onReasonChange(this.value)">
                <div>
                    <span class="reason-option-text">${reason.label}</span>
                </div>
            </label>
        `;
    });
    document.getElementById('reasonOptions').innerHTML = reasonHtml;

    // 당직 관련 reason들
    const dutyReasons = ['personal_duty', 'personal_rest', 'multi_duty', 'multi_rest', 'etc'];

    // 직원의 현재 상태 표시
    const leaveData = leaves[selectedDate] || {};
    const isOnLeave = currentUser && currentUser.name in leaveData;
    const leaveCount = Object.keys(leaveData).length; // 원래 갯수 5
    const nonDutyCount = Object.values(leaveData) // 당직 관련 제외 갯수 3
        .filter(reason => {
            const val = typeof reason === 'object' ? reason.label : reason;
            return !dutyReasons.includes(val);
        })
        .length;

    const capacity = maxCapacity[selectedDate] || defaultMaxCapacity; // 당직 제외 용량 3

    const btn = document.getElementById('toggleLeaveBtn');
    if (isOnLeave) {
        btn.textContent = '연가 취소';
        btn.style.background = 'linear-gradient(135deg, #E74C3C 0%, #C0392B 100%)';
        const userLeaveData = leaveData[currentUser.name];
        const val = typeof userLeaveData === 'object' ? userLeaveData.label : userLeaveData;
        const detail = typeof userLeaveData === 'object' ? userLeaveData.reason : '';
        const reasonLabel = leaveReasons.find(r => r.value === val)?.label || '';
        const displayDetail = detail ? ` (${detail})` : '';

        document.getElementById('employeeCurrentStatus').innerHTML = `
            <strong style="color: #0066CC;">✓ 연가 중입니다</strong><br>
            <span style="font-size: 13px; color: #95A0A8; margin-top: 4px; display: block;">사유: ${reasonLabel}${displayDetail}</span>
        `;
    } else {
        btn.textContent = '연가 신청';
        btn.style.background = 'linear-gradient(135deg, #0066CC 0%, #0052A3 100%)';

        if (nonDutyCount >= capacity) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            document.getElementById('employeeCurrentStatus').innerHTML = `
                <span style="color: #E74C3C; font-weight: 600;">최대 인원에 도달했습니다 (${nonDutyCount}/${capacity})</span>
                <span style="color:rgb(231, 143, 60); font-weight: 600;"><br>당직 관련 신청은 가능합니다.</span>
            `;
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            document.getElementById('employeeCurrentStatus').innerHTML = `
                <span style="color: #0066CC; font-weight: 600;">현재 인원: ${nonDutyCount}/${capacity}명</span>
            `;
        }
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    if (tab === 'calendar') {
        document.getElementById('calendarTab').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    }
    else {
        document.getElementById('settingsTab').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
    }
}

// ========================================
// 연가자 자세히 보기 (텍스트 현출)
// ========================================
function openDetailView() {
    // ⚠️ 편집 중이면 editingLeaves를, 아니면 전역 leaves를 사용 (상호 보완)
    const leaveData = (isModalEditing && Object.keys(editingLeaves).length > 0) 
                      ? editingLeaves 
                      : (leaves[selectedDate] || {});
    
    // 1. 사람들을 종류(label)별로 그룹핑
    const groups = {};
    const getTeamNum = (teamName) => {
        const num = parseInt(teamName.toString().replace(/[^0-9]/g, ''));
        return isNaN(num) ? 999 : num;
    };

    for (const [emp, reasonObj] of Object.entries(leaveData)) {
        const val = typeof reasonObj === 'object' ? reasonObj.label : reasonObj;
        const detail = typeof reasonObj === 'object' ? reasonObj.reason : '';
        const team = typeof reasonObj === 'object' ? (reasonObj.team || '미지정') : '미지정';
        const hierarchy = typeof reasonObj === 'object' ? (reasonObj.hierarchy || 999) : 999;
        
        if (!groups[val]) groups[val] = [];
        groups[val].push({ emp, detail, team, hierarchy });
    }

    // 각 그룹(사유별) 내에서 팀 순서 -> hierarchy 순서로 정렬
    Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => {
            const teamDiff = getTeamNum(a.team) - getTeamNum(b.team);
            if (teamDiff !== 0) return teamDiff;
            return (a.hierarchy || 999) - (b.hierarchy || 999);
        });
    });

    // 2. 상단, 하단 출력 순서 정의
    const upperOrder = ['annual', 'special', 'education', 'out_of_area_travel', 'compensatory_rest', 'leave_early_late'];
    const lowerOrder = ['personal_duty', 'personal_rest', 'multi_duty', 'multi_rest', 'etc'];
    
    // 예외적으로 'sick'이 있을 수 있으니 upperOrder 뒤에 처리
    const labelMap = {
        'annual': '연가',
        'special': '특가',
        'education': '교육',
        'sick': '병가',
        'out_of_area_travel': '관외',
        'compensatory_rest': '대체휴무',
        'leave_early_late': '조퇴/지각',
        'personal_duty': '개인당직',
        'personal_rest': '당직휴무',
        'multi_duty': '다목적당직',
        'multi_rest': '다당휴무',
        'etc': '기타'
    };

    let upperHtml = '';
    
    // 상단 연가류 구성
    upperOrder.forEach(key => {
        if (groups[key] && groups[key].length > 0) {
            const listStr = groups[key].map(u => u.detail ? `${u.emp}[${u.detail}]` : u.emp).join(', ');
            upperHtml += `${labelMap[key]} ${groups[key].length}(${listStr})\n`;
        }
    });

    if (groups['sick'] && groups['sick'].length > 0) {
        const listStr = groups['sick'].map(u => u.detail ? `${u.emp}[${u.detail}]` : u.emp).join(', ');
        upperHtml += `병가 ${groups['sick'].length}(${listStr})\n`;
    }

    let lowerHtml = '';
    
    // 하단 당직류 구성
    lowerOrder.forEach(key => {
        if (groups[key] && groups[key].length > 0) {
            const listStr = groups[key].map(u => u.detail ? `${u.emp}[${u.detail}]` : u.emp).join(', ');
            lowerHtml += `${labelMap[key]} ${groups[key].length}(${listStr})\n`;
        }
    });

    // 최종 합치기 (중간 띄어쓰기)
    let outputText = upperHtml.trim();
    if (outputText && lowerHtml.trim()) outputText += '\n\n';
    outputText += lowerHtml.trim();

    if (!outputText) {
        outputText = "등록된 연가자가 없습니다.";
    }

    document.getElementById('detailViewText').value = outputText;
    document.getElementById('detailViewModal').classList.add('active');
}

function closeDetailView() {
    document.getElementById('detailViewModal').classList.remove('active');
}

function copyDetailText() {
    const text = document.getElementById('detailViewText').value;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.textContent = '✓ 복사 됨!';
        btn.classList.add('copied');
        
        setTimeout(() => {
            btn.textContent = '복사하기';
            btn.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('복사에 실패했습니다. 내용을 직접 드래그해서 복사해주세요.');
    });
}
