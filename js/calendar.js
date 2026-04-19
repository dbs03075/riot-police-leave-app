// ========================================
// 캘린더 렌더링 함수 (최대 7명 표시)
// ========================================

let editingCapacityDate = null;

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = [
        '1월', '2월', '3월', '4월', '5월', '6월',
        '7월', '8월', '9월', '10월', '11월', '12월'
    ];
    document.getElementById('monthYear').textContent = `${year}년 ${monthNames[month]}`; // 몇 년도 무슨 달인지

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    let html = '';

    // 이전달 날짜들
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="day other-month"><div class="day-content"><div class="day-number">${daysInPrevMonth - i}</div></div></div>`;
    }

    // 현재달 날짜들
    const today = new Date();

    // 날짜별로 for 문으로 하나하나 사고자
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear();
        const isSelected = selectedDate && selectedDate === dateStr;

        // DB에서 연가 데이터 조회
        const leaveData = leaves[dateStr] || {};
        // 요일마다 사고자 데이터 들고 오고 없으면 중괄호


        // number 1 . 중요! 여기서 leaveCount 현출하니까 이거를 다당 다당휴무 당직휴무 당직을 포함 안시키게 계산시키면된다 .
        // 수정 전)
        // const leaveCount = Object.keys(leaveData).length; // 몇 개인지 파악

        // 수정 후)
        // 카운트 제외할 당직 사유들
        // console.log(Object.values(leaveData));
        const dutyReasons = ['personal_duty', 'personal_rest', 'multi_duty', 'multi_rest', 'etc']; // 제외하는 사유들은 leaveReason들과 value값을 통일시켜야함.
        const leaveCount = Object.keys(leaveData).length; // 실제 갯수

        const nonDutyCount = Object.values(leaveData) // 당직 관련 제외 갯수
            .filter(reason => {
                const val = typeof reason === 'object' ? reason.label : reason;
                return !dutyReasons.includes(val);
            })
            .length;

        const capacity = maxCapacity[dateStr] || defaultMaxCapacity; // 해당 요일 

        let classes = 'day';
        if (isToday) classes += ' today';
        if (isSelected) classes += ' selected';

        let leaveItemsHtml = '';
        let dutyItemsHtml = '';
        const leaveEntries = Object.entries(leaveData); // 이름 duty도 포함되게 정정 필요 object를  array로 만들어줘서 사용하기 편리하게

        // value로 label 찾기 // 바로 아래에서 사용할 것임. // 바로밑 for문에서 reason(annual)으로 label(연가) 찾기 위해 사용
        const getLabel = (value) => {
            const found = leaveReasons.find(r => r.value === value);
            return found ? found.label : value;  // 못 찾으면 value 그대로 반환
        };

        // number 2 . 여기 html 수정해서 같이 현출하지 말고 밑으로 보내게
        // 여기를 손봐줘야 함. 들고오는 건 동일하고 여기서 전부 다 현출한다. 

        // 2. 모든 엔트리를 순회하면서 당직 여부에 따라 분류 및 그룹화
        const teamDutyMap = {};
        const individualEntries = [];
        let totalDutyPeople = 0;
        let totalRegularPeople = 0;

        leaveEntries.forEach(([name, reasonData]) => {
            const val = typeof reasonData === 'object' ? reasonData.label : reasonData;
            const detail = typeof reasonData === 'object' ? reasonData.reason : '';
            const team = typeof reasonData === 'object' ? (reasonData.team || '미지정') : '미지정';

            if (dutyReasons.includes(val)) {
                totalDutyPeople++;
                const key = `${team}_${val}`;
                if (!teamDutyMap[key]) {
                    teamDutyMap[key] = { label: val, count: 1, team: team, names: [name] };
                } else {
                    teamDutyMap[key].count++;
                    teamDutyMap[key].names.push(name);
                }
            } else {
                totalRegularPeople++;
                individualEntries.push({ name, val, detail, team });
            }
        });

        // ⚠️ [추가] 팀 번호 순서대로 정렬 (1팀 -> 2팀 -> ... -> 9팀)
        individualEntries.sort((a, b) => {
            const getTeamNum = (teamName) => {
                const num = parseInt(teamName.replace(/[^0-9]/g, '')); // 숫자만 추출
                return isNaN(num) ? 999 : num; // 숫자가 없으면 맨 뒤로
            };
            return getTeamNum(a.team) - getTeamNum(b.team);
        });

        // 3. 렌더링 할당 (최대 10개 배지 제한)
        let totalDisplayItems = 0;
        let displayedDutyPeople = 0;
        let displayedRegularPeople = 0;

        // 당직 뱃지 만들기 (팀 단위)
        Object.values(teamDutyMap).forEach(dutyGroup => {
            if (totalDisplayItems >= 10) return; // 자리 없으면 더보기로

            let displayStr = '';
            // 개인당직과 당직휴무의 경우 이름 나열
            if (['personal_duty', 'personal_rest'].includes(dutyGroup.label)) {
                displayStr = `${dutyGroup.team} ${dutyGroup.names.join(', ')}(${getLabel(dutyGroup.label)})`;
            } else {
                displayStr = `${dutyGroup.team}(${getLabel(dutyGroup.label)})`;
            }

            dutyItemsHtml += `<div class="leave-badge ${dutyGroup.label} duty-badge">${displayStr}</div>`;
            totalDisplayItems++;
            displayedDutyPeople += dutyGroup.count;
        });

        // 일반 뱃지 만들기
        individualEntries.forEach(entry => {
            if (totalDisplayItems >= 10) return;

            const teamPrefix = entry.team !== '미지정' ? entry.team.replace('', '') : '';
            let displayStr = `${teamPrefix} ${entry.name}(${getLabel(entry.val)})`;

            if (['special', 'education', 'sick', 'compensatory_rest', 'leave_early_late', 'etc'].includes(entry.val) && entry.detail) {
                displayStr = `${teamPrefix}${entry.name}(${getLabel(entry.val)}, ${entry.detail})`;
            }
            leaveItemsHtml += `<div class="leave-badge ${entry.val}">${displayStr}</div>`;
            totalDisplayItems++;
            displayedRegularPeople++;
        });

        // 4. 더보기 표시
        const hiddenRegular = totalRegularPeople - displayedRegularPeople;
        const hiddenDuty = totalDutyPeople - displayedDutyPeople;

        if (hiddenRegular > 0) {
            leaveItemsHtml += `<div class="leave-more">+${hiddenRegular}명</div>`;
        }
        if (hiddenDuty > 0) {
            dutyItemsHtml += `<div class="leave-more">+${hiddenDuty}명 당직</div>`;
        }




        const currentMemo = teamQuotas[dateStr] || '';
        const memoHtml = currentMemo ? `<span class="team-quota-memo">${currentMemo}</span>` : '';

        html += `<div class="${classes}" onclick="selectDate('${dateStr}')">
            <div class="day-content">
                <div class="day-number">${day}${memoHtml}</div>
                <div class="day-count" 
                    ${currentUser && currentUser.role === 'admin' ? `onclick="openCapacityModal(event, '${dateStr}')"` : ''}
                    style="cursor: ${currentUser && currentUser.role === 'admin' ? 'pointer' : 'default'}">
                    ${nonDutyCount}/${capacity}
                </div>
            </div>
            ${leaveCount > 0 ? `<div class="day-leaves">${leaveItemsHtml}</div><div class="day-leaves">${dutyItemsHtml}</div>` : ''}
        </div>`;

    }


    // 다음달 날짜들
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    for (let day = 1; day <= totalCells - firstDay - daysInMonth; day++) {
        html += `<div class="day other-month"><div class="day-content"><div class="day-number">${day}</div></div></div>`;
    }

    document.getElementById('calendar').innerHTML = html;
}

function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

function selectDate(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    openModal();
}

// ========================================
// 용량 수정 모달
// ========================================

function openCapacityModal(event, dateStr) {
    event.stopPropagation(); // 날짜 클릭 이벤트 전파 방지

    editingCapacityDate = dateStr;
    const currentCapacity = maxCapacity[dateStr] || defaultMaxCapacity;

    // 모달 열기
    const modal = document.getElementById('capacityModal');
    if (!modal) {
        // 모달이 없으면 생성
        createCapacityModal();
    }

    document.getElementById('capacityInput').value = currentCapacity;
    document.getElementById('teamQuotaInput').value = teamQuotas[dateStr] || '';
    document.getElementById('capacityDateDisplay').textContent = formatDateForDisplay(dateStr);
    document.getElementById('capacityModal').classList.add('active');
}

function createCapacityModal() {
    const modalHTML = `
        <div id="capacityModal" class="capacity-modal">
            <div class="capacity-modal-content">
                <h3>📅 <span id="capacityDateDisplay">-</span></h3>
                <p style="color: #95A0A8; margin-bottom: 20px; font-size: 13px;">해당 날짜의 최대 연가 인원 및 팀 메모를 설정합니다.</p>
                
                <div style="margin-bottom: 15px;">
                    <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 5px;">총 가능 인원 (숫자)</label>
                    <input type="number" id="capacityInput" class="capacity-input" min="1" max="50" placeholder="인원 수 입력">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 5px;">팀별 메모 (예: 1팀(1명), 2팀(1명))</label>
                    <input type="text" id="teamQuotaInput" class="capacity-input" placeholder="메모 입력" style="width: 100%;">
                </div>

                <div class="capacity-modal-actions">
                    <button class="capacity-modal-save" onclick="saveCapacityModal()">저장</button>
                    <button class="capacity-modal-cancel" onclick="closeCapacityModal()">취소</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function saveCapacityModal() {
    const capacity = parseInt(document.getElementById('capacityInput').value);
    const memo = document.getElementById('teamQuotaInput').value.trim();

    if (isNaN(capacity) || capacity < 1) {
        alert('1 이상의 숫자를 입력하세요');
        return;
    }

    if (editingCapacityDate) {
        maxCapacity[editingCapacityDate] = capacity;
        saveSettingToFirebase(editingCapacityDate, capacity);

        teamQuotas[editingCapacityDate] = memo;
        saveTeamQuotaToFirebase(editingCapacityDate, memo);

        renderCalendar();
        closeCapacityModal();
    }
}

function closeCapacityModal() {
    const modal = document.getElementById('capacityModal');
    if (modal) {
        modal.classList.remove('active');
    }
    editingCapacityDate = null;
}

function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    return date.toLocaleDateString('ko-KR', options);
}

// 모달 외부 클릭 시 닫기
document.addEventListener('click', (e) => {
    const modal = document.getElementById('capacityModal');
    if (modal && e.target === modal) {
        closeCapacityModal();
    }
});

// Escape 키로 모달 닫기
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCapacityModal();
    }
});