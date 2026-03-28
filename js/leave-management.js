// ========================================
// 연가 관리 함수 (DB 연동)
// ========================================

// 📌 DB에서 로드한 직원 목록으로 UI 생성
function renderEmployeeList() {
    let html = '';

    // 팀별로 분류
    const grouped = {};
    employees.forEach(emp => {
        if (!grouped[emp.team]) grouped[emp.team] = [];
        grouped[emp.team].push(emp.name);
    });

    const teams = Object.keys(grouped).sort();

    teams.forEach(team => {
        html += `<div class="team-group">`;
        html += `<div class="team-header">
                    <label style="font-weight:bold; cursor:pointer;" class="employee-item">
                        <input type="checkbox" onchange="toggleTeamCheck('${team}', this.checked)"> ${team}
                    </label>
                    <select class="reason-select" style="margin-left: 10px; width:100px; padding: 2px;" onchange="changeTeamReason('${team}', this.value)">
                        <option value="">일괄 사유</option>
                        <option value="annual">연가</option>
                        <option value="special">특별휴가</option>
                        <option value="education">교육</option>
                        <option value="sick">병가</option>
                        <option value="out_of_area_travel">관외</option>
                        <option value="personal_duty">개인당직</option>
                        <option value="personal_rest">당직휴무</option>
                        <option value="compensatory_rest">대체휴무</option>
                        <option value="multi_duty">다목적당직</option>
                        <option value="multi_rest">다당휴무</option>
                    </select>
                 </div>`;
        html += `<div class="team-members">`;

        grouped[team].forEach(empName => {
            const isSelected = editingLeaves[empName]; // ⚠️ editingLeaves를 사용하여 현재 편집 상태 반영
            html += `
                <label class="employee-item team-member-${team}" data-name="${empName}">
                    <input type="checkbox" value="${empName}" class="emp-checkbox-${team}" ${isSelected ? 'checked' : ''} onchange="updateEmployeeReason('${empName}', '${team}')">
                    <div class="employee-item-content">
                        <span class="employee-name">${empName}</span>
                        <div style="display:flex; flex-direction:column; gap:5px; width:100%;">
                            <select class="reason-select emp-reason-${team}" id="reason-${empName}" onchange="updateEmployeeReason('${empName}', '${team}')">
                                <option value="annual">연가</option>
                                <option value="special">특별휴가</option>
                                <option value="education">교육</option>
                                <option value="sick">병가</option>
                                <option value="out_of_area_travel">관외</option>
                                <option value="personal_duty">개인당직</option>
                                <option value="personal_rest">당직휴무</option>
                                <option value="compensatory_rest">대체휴무</option>
                                <option value="multi_duty">다목적당직</option>
                                <option value="multi_rest">다당휴무</option>
                            </select>
                            <input type="text" id="detail-reason-${empName}" class="detail-reason-input" placeholder="사유 입력" onchange="updateEmployeeReason('${empName}', '${team}')">
                        </div>
                    </div>
                </label>
            `;
        });
        html += `</div></div>`;
    });

    if (employees.length === 0) {
        html = '<div class="empty-state"><p>등록된 직원이 없습니다</p></div>';
    }

    document.getElementById('employeeList').innerHTML = html;

    // 선택된 연가자의 사유 반영
    employees.forEach(emp => {
        const empName = emp.name;
        const reasonSelect = document.getElementById(`reason-${empName}`);
        const detailInput = document.getElementById(`detail-reason-${empName}`);
        const userLeaveData = editingLeaves[empName]; // ⚠️ editingLeaves 사용

        if (reasonSelect && userLeaveData) {
            const val = typeof userLeaveData === 'object' ? userLeaveData.label : userLeaveData;
            const detail = typeof userLeaveData === 'object' ? userLeaveData.reason : '';
            reasonSelect.value = val;
            if (detailInput) {
                detailInput.value = detail;
                const reqDetail = ['special', 'education', 'sick', 'compensatory_rest'].includes(val);
                detailInput.style.display = reqDetail ? 'block' : 'none';
            }
        }
    });
}

function toggleTeamCheck(team, isChecked) {
    const checkboxes = document.querySelectorAll(`.emp-checkbox-${team}`);
    checkboxes.forEach(cb => {
        if (cb.checked !== isChecked) {
            cb.checked = isChecked;
            const empName = cb.value;
            updateEmployeeReason(empName, team);
        }
    });
}

function changeTeamReason(team, reasonValue) {
    if (!reasonValue) return;
    const selects = document.querySelectorAll(`.emp-reason-${team}`);
    selects.forEach(select => {
        select.value = reasonValue;
        const empName = select.id.replace('reason-', '');
        const cb = document.querySelector(`input[value="${empName}"]`);
        if (cb.checked) {
            updateEmployeeReason(empName, team);
        }
    });
}

function updateEmployeeReason(empName, team = '미지정') {
    const checkbox = document.querySelector(`input[value="${empName}"]`);
    const reasonSelect = document.getElementById(`reason-${empName}`);
    const detailInput = document.getElementById(`detail-reason-${empName}`);

    if (checkbox && checkbox.checked) {
        const val = reasonSelect.value;
        const reqDetail = ['special', 'education', 'sick', 'compensatory_rest'].includes(val);
        if (detailInput) detailInput.style.display = reqDetail ? 'block' : 'none';

        editingLeaves[empName] = { // ⚠️ editingLeaves에 직접 저장
            label: val,
            reason: detailInput && detailInput.style.display !== 'none' ? detailInput.value : '',
            team: team
        };
    } else {
        if (detailInput) detailInput.style.display = 'none';
        delete editingLeaves[empName]; // ⚠️ editingLeaves에서 삭제
    }

    updateLeaveItems();
}

function updateLeaveItems() {
    const emps = Object.keys(editingLeaves); // ⚠️ editingLeaves를 기반으로 하단 리스트 현출

    if (emps.length === 0) {
        document.getElementById('leaveItems').innerHTML = '<div class="empty-state"><p>아직 등록된 연가자가 없습니다</p></div>';
    } else {
        let html = '';
        emps.forEach(empName => {
            const userLeaveData = editingLeaves[empName];
            const val = typeof userLeaveData === 'object' ? userLeaveData.label : userLeaveData;
            const detail = typeof userLeaveData === 'object' ? userLeaveData.reason : '';
            const reasonObj = leaveReasons.find(r => r.value === val);
            const reasonLabelText = reasonObj ? reasonObj.label : val;
            const displayDetail = detail ? ` (${detail})` : '';

            html += `
                <div class="leave-item">
                    <div>
                        <div class="leave-item-name">${empName}</div>
                        <div class="employee-reason">${reasonLabelText}${displayDetail}</div>
                    </div>
                </div>
            `;
        });
        document.getElementById('leaveItems').innerHTML = html;
    }
}

function toggleEmployeeLeave() {
    if (!selectedDate || !currentUser) return;

    // 일반 사용자 연가 신청용도 editingLeaves 사용
    if (!editingLeaves) editingLeaves = {}; 

    // 당직 관련 reason들
    const dutyReasons = ['personal_duty', 'personal_rest', 'multi_duty', 'multi_rest'];
    const capacity = maxCapacity[selectedDate] || defaultMaxCapacity; 

    // ✅ 신청하려는 내 사유가 당직인지 먼저 확인
    const myReasonIsDuty = dutyReasons.includes(selectedReason);

    if (currentUser.name in editingLeaves) {
        // 연가 취소 (무조건 가능)
        delete editingLeaves[currentUser.name];
    } else {
        // 연가 신청
        if (!myReasonIsDuty) {
            // 1. 당직이 아니면 → 용량 체크
            const nonDutyCount = Object.values(editingLeaves)
                .filter(reason => {
                    const val = typeof reason === 'object' ? reason.label : reason;
                    return !dutyReasons.includes(val);
                })
                .length;

            if (nonDutyCount >= capacity) {
                alert(`최대 인원(${capacity}명)에 도달했습니다`);
                return;
            }
        }
        // 2. 당직이든 아니든 → 저장
        const detailInput = document.getElementById('detailReasonInput');
        editingLeaves[currentUser.name] = {
            label: selectedReason,
            reason: detailInput && detailInput.style.display !== 'none' ? detailInput.value : '',
            team: currentUser.team || '미지정'
        };
    }

    saveLeave();
}

function filterEmployees() {
    const searchValue = document.getElementById('employeeSearch').value.toLowerCase();
    
    // 각 팀 그룹별로 처리
    const teamGroups = document.querySelectorAll('.team-group');
    teamGroups.forEach(group => {
        const items = group.querySelectorAll('.employee-item[data-name]');
        let hasVisibleMember = false;
        
        items.forEach(item => {
            const nameElement = item.querySelector('.employee-name');
            if (!nameElement) return;
            
            const name = nameElement.textContent.toLowerCase();
            if (name.includes(searchValue)) {
                item.style.display = 'flex';
                hasVisibleMember = true;
            } else {
                item.style.display = 'none';
            }
        });
        
        // 검색어에 일치하는 직원이 한 명이라도 있으면 팀 그룹 전체 보이기, 없으면 숨기기
        if (hasVisibleMember || searchValue === '') {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
        }
    });
}
