// ========================================
// 관리자 제대원 관리
// ========================================

let managedEmployees = [];
const MANAGED_TEAM_VALUES = Array.from({ length: 9 }, (_, index) => `${index + 1}팀`);
let employeeManagementLoading = false;
let employeeManagementUnit = '';
let employeeManagementUserUid = '';
let employeeManagementSearch = '';
let employeeManagementTeam = 'all';
let employeeManagementOpenId = '';

function getUnitOrder(unit) {
    const index = units.indexOf(unit);
    return index === -1 ? 999 : index;
}

function compareTeamNames(left, right) {
    return String(left || '미지정').localeCompare(String(right || '미지정'), 'ko', {
        numeric: true,
        sensitivity: 'base',
    });
}

function setEmployeeManagementStatus(message, type = '') {
    const status = document.getElementById('employeeManagementStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `employee-management-status${type ? ` ${type}` : ''}`;
}

function initializeEmployeeManagementUnit() {
    const userUid = currentUser?.uid || currentUser?.authUid || auth.currentUser?.uid || '';
    if (employeeManagementUserUid !== userUid) {
        employeeManagementUserUid = userUid;
        employeeManagementUnit = units.includes(currentUser?.unit) ? currentUser.unit : units[0];
    }

    if (!units.includes(employeeManagementUnit)) {
        employeeManagementUnit = units.includes(currentUser?.unit) ? currentUser.unit : units[0];
    }

    const select = document.getElementById('employeeManagementUnit');
    if (select) {
        select.innerHTML = units.map((unit) =>
            `<option value="${escapeHtml(unit)}"${unit === employeeManagementUnit ? ' selected' : ''}>${escapeHtml(unit)}</option>`
        ).join('');
        select.value = employeeManagementUnit;
    }
}

function changeEmployeeManagementUnit(unit) {
    if (!units.includes(unit)) return;
    employeeManagementUnit = unit;
    employeeManagementTeam = 'all';
    employeeManagementOpenId = '';
    renderEmployeeManagement();
}

function filterEmployeeManagement(value) {
    employeeManagementSearch = String(value || '').trim().toLowerCase();
    employeeManagementOpenId = '';
    renderEmployeeManagement();
}

function changeEmployeeManagementTeam(team) {
    employeeManagementTeam = team || 'all';
    employeeManagementOpenId = '';
    renderEmployeeManagement();
}

function toggleManagedEmployeeEditor(button) {
    const row = button.closest('.organization-member');
    const employeeId = row?.dataset.employeeId || '';
    employeeManagementOpenId = employeeManagementOpenId === employeeId ? '' : employeeId;
    renderEmployeeManagement();
}

async function callEmployeeAdminApi(url, body) {
    if (!auth.currentUser || !currentUser || currentUser.role !== 'admin') {
        throw new Error('관리자 로그인이 필요합니다.');
    }
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
        const error = new Error(result.message || '요청을 처리하지 못했습니다.');
        error.code = result.code || `http/${response.status}`;
        throw error;
    }
    return result;
}

async function loadEmployeeManagement() {
    const list = document.getElementById('employeeManagementList');
    if (!list || employeeManagementLoading || !currentUser || currentUser.role !== 'admin') return;

    initializeEmployeeManagementUnit();
    employeeManagementLoading = true;
    list.innerHTML = '';
    setEmployeeManagementStatus('제대원 정보를 불러오는 중입니다...');
    try {
        const snapshot = await db.collection('employees').where('role', '==', 'employee').get();
        managedEmployees = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                authUid: data.authUid || '',
                username: data.username || '',
                email: data.email || '',
                name: data.name || '이름 없음',
                unit: data.unit || '미지정',
                team: data.team || '미지정',
                hierarchy: Number(data.hierarchy) || 999,
            };
        }).sort((a, b) =>
            getUnitOrder(a.unit) - getUnitOrder(b.unit) ||
            compareTeamNames(a.team, b.team) ||
            a.hierarchy - b.hierarchy ||
            a.name.localeCompare(b.name, 'ko')
        );

        renderEmployeeManagement();
    } catch (error) {
        console.error('제대원 관리 목록 로드 실패:', error);
        setEmployeeManagementStatus('제대원 목록을 불러오지 못했습니다.', 'error');
    } finally {
        employeeManagementLoading = false;
    }
}

function renderEmployeeManagement() {
    const container = document.getElementById('employeeManagementList');
    if (!container) return;
    initializeEmployeeManagementUnit();
    const searchInput = document.getElementById('employeeManagementSearch');
    const teamFilters = document.getElementById('employeeManagementTeamFilters');
    if (searchInput && searchInput.value !== employeeManagementSearch) searchInput.value = employeeManagementSearch;

    const unitEmployees = managedEmployees.filter((employee) => employee.unit === employeeManagementUnit);
    const teams = [...new Set(unitEmployees.map((employee) => employee.team || '미지정'))].sort(compareTeamNames);
    if (employeeManagementTeam !== 'all' && !teams.includes(employeeManagementTeam)) employeeManagementTeam = 'all';

    if (teamFilters) {
        const teamOptions = [{ value: 'all', label: `전체 ${unitEmployees.length}` }].concat(
            teams.map((team) => ({
                value: team,
                label: `${team} ${unitEmployees.filter((employee) => (employee.team || '미지정') === team).length}`,
            }))
        );
        teamFilters.innerHTML = teamOptions.map((team) => `
            <button type="button" class="employee-management-team-btn${team.value === employeeManagementTeam ? ' active' : ''}"
                data-team="${encodeURIComponent(team.value)}" aria-pressed="${team.value === employeeManagementTeam}"
                onclick="changeEmployeeManagementTeam(decodeURIComponent(this.dataset.team))">
                ${escapeHtml(team.label)}
            </button>
        `).join('');
    }

    const visibleEmployees = unitEmployees.filter((employee) => {
        const matchesTeam = employeeManagementTeam === 'all' || (employee.team || '미지정') === employeeManagementTeam;
        const searchable = `${employee.name} ${employee.username} ${employee.email}`.toLowerCase();
        return matchesTeam && searchable.includes(employeeManagementSearch);
    });

    const hasFilter = employeeManagementTeam !== 'all' || Boolean(employeeManagementSearch);
    setEmployeeManagementStatus(
        hasFilter
            ? `${employeeManagementUnit} 전체 ${unitEmployees.length}명 중 ${visibleEmployees.length}명을 표시합니다.`
            : `${employeeManagementUnit} 제대원 ${unitEmployees.length}명이 등록되어 있습니다.`,
        'success'
    );

    if (!unitEmployees.length) {
        container.innerHTML = `<div class="employee-management-empty">${escapeHtml(employeeManagementUnit)}에 등록된 제대원이 없습니다.</div>`;
        return;
    }

    if (!visibleEmployees.length) {
        container.innerHTML = '<div class="employee-management-empty">검색 조건에 맞는 제대원이 없습니다.</div>';
        return;
    }

    const grouped = new Map();
    visibleEmployees.forEach((employee) => {
        if (!grouped.has(employee.team)) grouped.set(employee.team, []);
        grouped.get(employee.team).push(employee);
    });

    let html = '<section class="organization-unit organization-unit-compact">';

    for (const [team, members] of grouped) {
            html += `<div class="organization-team">
                <div class="organization-team-header">
                    <strong>${escapeHtml(team)}</strong>
                    <span>${members.length}명</span>
                </div>
                <div class="organization-member-list">`;

            members.forEach((employee, index) => {
                const unitOptions = units.map((value) =>
                    `<option value="${escapeHtml(value)}"${value === employee.unit ? ' selected' : ''}>${escapeHtml(value)}</option>`
                ).join('');
                const unknownTeamOption = MANAGED_TEAM_VALUES.includes(employee.team)
                    ? ''
                    : '<option value="" selected disabled>팀 선택</option>';
                const teamOptions = unknownTeamOption + MANAGED_TEAM_VALUES.map((value) =>
                    `<option value="${value}"${value === employee.team ? ' selected' : ''}>${value}</option>`
                ).join('');
                const isOpen = employee.id === employeeManagementOpenId;
                html += `<article class="organization-member${isOpen ? ' open' : ''}" data-employee-id="${escapeHtml(employee.id)}">
                    <button type="button" class="organization-member-summary" aria-expanded="${isOpen}"
                        onclick="toggleManagedEmployeeEditor(this)">
                        <span class="organization-rank">${employee.hierarchy}</span>
                        <span class="organization-identity">
                            <strong>${escapeHtml(employee.name)}</strong>
                            <span>${escapeHtml(employee.username || '아이디 미연결')} · ${escapeHtml(employee.team)} · 연번 ${employee.hierarchy}</span>
                            <small>${escapeHtml(employee.email || '이메일 없음')}</small>
                        </span>
                        <span class="organization-expand-icon" aria-hidden="true">${isOpen ? '▲' : '▼'}</span>
                    </button>
                    <div class="organization-member-editor">
                        <div class="organization-editor-fields">
                            <label class="organization-field">
                                <span>제대</span>
                                <select data-field="unit">${unitOptions}</select>
                            </label>
                            <label class="organization-field">
                                <span>팀</span>
                                <select data-field="team">${teamOptions}</select>
                            </label>
                            <label class="organization-field organization-field-small">
                                <span>팀 내 연번</span>
                                <input data-field="hierarchy" type="number" min="1" max="999" step="1" value="${employee.hierarchy}">
                            </label>
                        </div>
                        <div class="organization-actions">
                            <button type="button" class="organization-delete" onclick="deleteManagedEmployee(this)">제대원 삭제</button>
                            <button type="button" class="organization-save" onclick="saveManagedEmployee(this)">변경 저장</button>
                        </div>
                    </div>
                </article>`;
            });

            html += '</div></div>';
    }
    html += '</section>';
    container.innerHTML = html;
}

async function saveManagedEmployee(button) {
    const row = button.closest('.organization-member');
    const employeeId = row?.dataset.employeeId;
    const unit = row?.querySelector('[data-field="unit"]')?.value;
    const team = row?.querySelector('[data-field="team"]')?.value.trim();
    const hierarchy = Number(row?.querySelector('[data-field="hierarchy"]')?.value);
    if (!employeeId || !units.includes(unit) || !MANAGED_TEAM_VALUES.includes(team) || !Number.isInteger(hierarchy) || hierarchy < 1 || hierarchy > 999) {
        alert('제대, 팀, 연번(1~999)을 확인해주세요.');
        return;
    }

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = '저장 중...';
    try {
        await callEmployeeAdminApi(AUTH_API_URLS.updateEmployee, { employeeId, unit, team, hierarchy });
        await loadEmployeeManagement();
        setEmployeeManagementStatus('제대원 정보가 수정되었습니다.', 'success');
    } catch (error) {
        console.error('제대원 수정 실패:', error);
        alert(error.message || '제대원 정보를 수정하지 못했습니다.');
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function deleteManagedEmployee(button) {
    const row = button.closest('.organization-member');
    const employeeId = row?.dataset.employeeId;
    const employee = managedEmployees.find((item) => item.id === employeeId);
    if (!employee || !confirm(`${employee.name} 제대원을 삭제하시겠습니까?\n\nAuthentication 계정과 employees 정보가 함께 삭제됩니다.`)) return;

    button.disabled = true;
    button.textContent = '삭제 중...';
    try {
        await callEmployeeAdminApi(AUTH_API_URLS.deleteEmployee, { employeeId });
        await loadEmployeeManagement();
        setEmployeeManagementStatus(`${employee.name} 제대원을 삭제했습니다.`, 'success');
    } catch (error) {
        console.error('제대원 삭제 실패:', error);
        alert(error.message || '제대원을 삭제하지 못했습니다.');
        button.disabled = false;
        button.textContent = '삭제';
    }
}
