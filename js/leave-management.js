// ========================================
// 연가 관리 함수 (DB 연동)
// ========================================

let employeePickerMode = localStorage.getItem('employee_picker_mode') || 'quick';
let quickPickerReason = 'annual';
let quickPickerTeam = 'all';
const quickPickerDetails = {};
const quickDetailReasons = ['special', 'education', 'sick', 'compensatory_rest', 'leave_early_late', 'etc'];

function renderEmployeeList() {
    const quickPicker = document.getElementById('quickEmployeePicker');
    const legacyPicker = document.getElementById('legacyEmployeePicker');
    const modeToggle = document.getElementById('employeePickerModeToggle');

    if (!quickPicker || !legacyPicker) return;

    const useQuickPicker = employeePickerMode === 'quick';
    quickPicker.style.display = useQuickPicker ? 'block' : 'none';
    legacyPicker.style.display = useQuickPicker ? 'none' : 'block';

    if (modeToggle) {
        modeToggle.textContent = useQuickPicker ? '기존 방식' : '빠른 선택';
        modeToggle.setAttribute('aria-label', useQuickPicker ? '기존 직원 선택 방식으로 전환' : '빠른 직원 선택 방식으로 전환');
    }

    if (useQuickPicker) {
        renderQuickEmployeePicker();
    } else {
        renderLegacyEmployeeList();
    }
}

function toggleEmployeePickerMode() {
    employeePickerMode = employeePickerMode === 'quick' ? 'legacy' : 'quick';
    localStorage.setItem('employee_picker_mode', employeePickerMode);
    renderEmployeeList();
}

function renderQuickEmployeePicker() {
    const reasonButtons = document.getElementById('quickReasonButtons');
    const teamButtons = document.getElementById('quickTeamButtons');
    const employeeGrid = document.getElementById('quickEmployeeGrid');
    const selectedEmployees = document.getElementById('quickSelectedEmployees');
    const selectedCount = document.getElementById('quickSelectedCount');
    const searchInput = document.getElementById('quickEmployeeSearch');
    const detailInput = document.getElementById('quickReasonDetail');

    if (!reasonButtons || !teamButtons || !employeeGrid || !selectedEmployees || !selectedCount || !searchInput || !detailInput) return;

    reasonButtons.innerHTML = leaveReasons.map(reason => `
        <button type="button" class="quick-reason-btn${reason.value === quickPickerReason ? ' active' : ''}"
            data-reason="${reason.value}" aria-pressed="${reason.value === quickPickerReason}">
            ${escapeHtml(reason.label)}
        </button>
    `).join('');

    const teams = [...new Set(employees.map(emp => emp.team || '미지정'))].sort();
    const teamOptions = [{ value: 'all', label: `전체 ${employees.length}` }].concat(
        teams.map(team => ({
            value: team,
            label: `${team} ${employees.filter(emp => (emp.team || '미지정') === team).length}`
        }))
    );

    if (quickPickerTeam !== 'all' && !teams.includes(quickPickerTeam)) quickPickerTeam = 'all';

    teamButtons.innerHTML = teamOptions.map(team => `
        <button type="button" class="quick-team-btn${team.value === quickPickerTeam ? ' active' : ''}"
            data-team="${encodeURIComponent(team.value)}" aria-pressed="${team.value === quickPickerTeam}">
            ${escapeHtml(team.label)}
        </button>
    `).join('');

    const needsDetail = quickDetailReasons.includes(quickPickerReason);
    detailInput.style.display = needsDetail ? 'block' : 'none';
    detailInput.value = quickPickerDetails[quickPickerReason] || '';

    const searchValue = searchInput.value.trim().toLowerCase();
    const visibleEmployees = employees
        .filter(emp => quickPickerTeam === 'all' || (emp.team || '미지정') === quickPickerTeam)
        .filter(emp => emp.name.toLowerCase().includes(searchValue))
        .sort((a, b) => {
            const teamCompare = (a.team || '미지정').localeCompare(b.team || '미지정', 'ko');
            if (teamCompare !== 0) return teamCompare;
            const hierarchyCompare = (a.hierarchy || 999) - (b.hierarchy || 999);
            return hierarchyCompare !== 0 ? hierarchyCompare : a.name.localeCompare(b.name, 'ko');
        });

    employeeGrid.innerHTML = visibleEmployees.length > 0
        ? visibleEmployees.map(emp => {
            const leaveData = editingLeaves[emp.name];
            const isSelected = Boolean(leaveData);
            const reasonValue = isSelected ? (typeof leaveData === 'object' ? leaveData.label : leaveData) : '';
            const reasonLabel = leaveReasons.find(reason => reason.value === reasonValue)?.label || '';
            return `
                <button type="button" class="quick-employee-btn${isSelected ? ' selected' : ''}"
                    data-employee="${encodeURIComponent(emp.name)}" aria-pressed="${isSelected}">
                    <span class="quick-employee-name">${escapeHtml(emp.name)}</span>
                    ${isSelected ? `<span class="quick-employee-reason">${escapeHtml(reasonLabel)}</span>` : ''}
                </button>
            `;
        }).join('')
        : '<div class="quick-picker-empty">검색 결과가 없습니다.</div>';

    const selectedNames = Object.keys(editingLeaves).sort((a, b) => {
        const employeeA = employees.find(emp => emp.name === a);
        const employeeB = employees.find(emp => emp.name === b);
        return (employeeA?.hierarchy || 999) - (employeeB?.hierarchy || 999);
    });

    selectedCount.textContent = `${selectedNames.length}명 선택`;
    selectedEmployees.innerHTML = selectedNames.length > 0
        ? selectedNames.map(name => {
            const leaveData = editingLeaves[name];
            const reasonValue = typeof leaveData === 'object' ? leaveData.label : leaveData;
            const reasonLabel = leaveReasons.find(reason => reason.value === reasonValue)?.label || reasonValue;
            return `
                <button type="button" class="quick-selected-chip" data-remove-employee="${encodeURIComponent(name)}"
                    aria-label="${escapeHtml(name)} 선택 해제">
                    ${escapeHtml(name)} · ${escapeHtml(reasonLabel)} <span aria-hidden="true">×</span>
                </button>
            `;
        }).join('')
        : '<span class="quick-selected-empty">선택된 직원이 없습니다.</span>';

    reasonButtons.onclick = event => {
        const button = event.target.closest('[data-reason]');
        if (!button) return;
        quickPickerReason = button.dataset.reason;
        renderQuickEmployeePicker();
    };

    teamButtons.onclick = event => {
        const button = event.target.closest('[data-team]');
        if (!button) return;
        quickPickerTeam = decodeURIComponent(button.dataset.team);
        renderQuickEmployeePicker();
    };

    employeeGrid.onclick = event => {
        const button = event.target.closest('[data-employee]');
        if (!button) return;
        toggleQuickEmployeeSelection(decodeURIComponent(button.dataset.employee));
    };

    selectedEmployees.onclick = event => {
        const button = event.target.closest('[data-remove-employee]');
        if (!button) return;
        delete editingLeaves[decodeURIComponent(button.dataset.removeEmployee)];
        updateLeaveItems();
        renderQuickEmployeePicker();
    };

    searchInput.oninput = renderQuickEmployeePicker;
    detailInput.oninput = () => {
        quickPickerDetails[quickPickerReason] = detailInput.value;
    };
}

function toggleQuickEmployeeSelection(empName) {
    const currentLeave = editingLeaves[empName];
    const currentReason = currentLeave && (typeof currentLeave === 'object' ? currentLeave.label : currentLeave);

    if (currentReason === quickPickerReason) {
        delete editingLeaves[empName];
    } else {
        const empInfo = employees.find(emp => emp.name === empName);
        editingLeaves[empName] = {
            label: quickPickerReason,
            reason: quickDetailReasons.includes(quickPickerReason) ? (quickPickerDetails[quickPickerReason] || '') : '',
            team: empInfo?.team || '미지정',
            hierarchy: empInfo?.hierarchy || 999
        };
    }

    updateLeaveItems();
    renderQuickEmployeePicker();
}

function clearQuickEmployeeSelection() {
    editingLeaves = {};
    updateLeaveItems();
    renderQuickEmployeePicker();
}

// 📌 DB에서 로드한 직원 목록으로 UI 생성
function renderLegacyEmployeeList() {
    let html = '';

    // 팀별로 분류
    const grouped = {};
    employees.forEach(emp => {
        if (!grouped[emp.team]) grouped[emp.team] = [];
        grouped[emp.team].push(emp); // 이름 대신 객체 전체 저장
    });

    // 각 팀 내에서 hierarchy 순으로 정렬
    Object.keys(grouped).forEach(team => {
        grouped[team].sort((a, b) => (a.hierarchy || 999) - (b.hierarchy || 999));
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
                        <option value="leave_early_late">조퇴/지각</option>
                        <option value="etc">기타</option>
                    </select>
                 </div>`;
        html += `<div class="team-members">`;

        grouped[team].forEach(emp => {
            const empName = emp.name;
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
                                <option value="leave_early_late">조퇴/지각</option>
                                <option value="etc">기타</option>
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
                const reqDetail = ['special', 'education', 'sick', 'compensatory_rest', 'leave_early_late', 'etc'].includes(val);
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
        const reqDetail = ['special', 'education', 'sick', 'compensatory_rest', 'leave_early_late', 'etc'].includes(val);
        if (detailInput) detailInput.style.display = reqDetail ? 'block' : 'none';

        const empInfo = employees.find(e => e.name === empName);
        editingLeaves[empName] = { // ⚠️ editingLeaves에 직접 저장
            label: val,
            reason: detailInput && detailInput.style.display !== 'none' ? detailInput.value : '',
            team: team,
            hierarchy: empInfo ? (empInfo.hierarchy || 999) : 999
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
            const safeDisplayReason = escapeHtml(`${reasonLabelText}${displayDetail}`);
            const safeEmployeeName = escapeHtml(empName);

            html += `
                <div class="leave-item">
                    <div>
                        <div class="leave-item-name">${safeEmployeeName}</div>
                        <div class="employee-reason">${safeDisplayReason}</div>
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
    const dutyReasons = ['personal_duty', 'personal_rest', 'multi_duty', 'multi_rest', 'etc'];
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
            team: currentUser.team || '미지정',
            hierarchy: currentUser.hierarchy || 999
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
