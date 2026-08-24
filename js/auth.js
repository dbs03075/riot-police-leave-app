// Firebase Authentication + employees profile flow
let authOperationInProgress = false;

function setAuthMessage(message, type = 'error') {
    const errorEl = document.getElementById('loginError');
    const successEl = document.getElementById('authSuccess');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    if (!message) return;
    const target = type === 'success' ? successEl : errorEl;
    target.textContent = message;
    target.style.display = 'block';
}

function showLoginError(message) {
    setAuthMessage(message, 'error');
}

function showAuthMode(mode) {
    document.querySelectorAll('.auth-panel').forEach((panel) => panel.classList.remove('active'));
    document.querySelectorAll('.auth-mode-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.authMode === mode);
    });
    const panel = document.getElementById(`${mode}Form`);
    if (panel) panel.classList.add('active');
    setAuthMessage('');
}

function updateSignupRoleFields() {
    const isEmployee = document.getElementById('signupRole').value === 'employee';
    const fields = document.getElementById('employeeSignupFields');
    fields.style.display = isEmployee ? 'grid' : 'none';
    document.getElementById('signupTeam').required = isEmployee;
    document.getElementById('signupHierarchy').required = isEmployee;
}

function validateUsername(username) {
    return /^[a-z0-9][a-z0-9._-]{3,23}$/.test(normalizeUsername(username));
}

function getAuthErrorMessage(error) {
    const code = error && error.code;
    if (code === 'auth/invalid-login-credentials' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        return '아이디 또는 비밀번호가 올바르지 않습니다.';
    }
    if (code === 'auth/too-many-requests') return '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.';
    if (code === 'auth/network-request-failed') return '네트워크 연결을 확인해주세요.';
    return error && error.message ? error.message : '요청 처리 중 오류가 발생했습니다.';
}

async function postAuthApi(url, body, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
        const error = new Error(result.message || '요청을 처리하지 못했습니다.');
        error.code = result.code || `http/${response.status}`;
        throw error;
    }
    return result;
}

async function login() {
    const username = normalizeUsername(document.getElementById('usernameInput').value);
    const password = document.getElementById('passwordInput').value;
    const loginBtn = document.querySelector('#loginForm .login-btn');

    if (!validateUsername(username) || !password) {
        showLoginError('아이디(4~24자 영문 소문자/숫자)와 비밀번호를 확인해주세요.');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = '로그인 중...';
    setAuthMessage('');
    try {
        await auth.signInWithEmailAndPassword(usernameToAuthEmail(username), password);
    } catch (error) {
        showLoginError(getAuthErrorMessage(error));
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
    }
}

async function signup() {
    const button = document.querySelector('#signupForm .login-btn');
    const role = document.getElementById('signupRole').value;
    const payload = {
        username: normalizeUsername(document.getElementById('signupUsername').value),
        name: document.getElementById('signupName').value.trim(),
        email: document.getElementById('signupEmail').value.trim().toLowerCase(),
        password: document.getElementById('signupPassword').value,
        role,
        unit: document.getElementById('signupUnit').value,
        team: role === 'employee' ? document.getElementById('signupTeam').value.trim() : '미지정',
        hierarchy: role === 'employee' ? Number(document.getElementById('signupHierarchy').value) : 999,
    };

    if (!validateUsername(payload.username)) return showLoginError('아이디는 4~24자 영문 소문자, 숫자, ., _, -만 사용할 수 있습니다.');
    if (!payload.name || !payload.email || payload.password.length < 8) return showLoginError('필수 항목과 8자 이상의 비밀번호를 확인해주세요.');
    if (role === 'employee' && (!payload.team || !Number.isInteger(payload.hierarchy) || payload.hierarchy < 1)) {
        return showLoginError('일반 제대원은 팀과 팀 내 연번을 입력해야 합니다.');
    }

    button.disabled = true;
    button.textContent = '계정 생성 중...';
    setAuthMessage('');
    try {
        await postAuthApi(AUTH_API_URLS.register, payload);
        setAuthMessage('회원가입이 완료되었습니다. 로그인합니다.', 'success');
        await auth.signInWithEmailAndPassword(usernameToAuthEmail(payload.username), payload.password);
        document.getElementById('signupForm').reset();
        updateSignupRoleFields();
    } catch (error) {
        const messages = {
            'username-already-exists': '이미 사용 중인 아이디입니다.',
            'email-already-exists': '이미 등록된 이메일입니다.',
            'admin-auth-required': '관리자 계정은 기존 관리자가 로그인한 관리 화면에서만 추가할 수 있습니다.',
        };
        showLoginError(messages[error.code] || getAuthErrorMessage(error));
    } finally {
        button.disabled = false;
        button.textContent = '회원가입';
    }
}

async function activateExistingAccount() {
    const email = document.getElementById('activateEmail').value.trim().toLowerCase();
    const password = document.getElementById('activatePassword').value;
    const username = normalizeUsername(document.getElementById('activateUsername').value);
    const button = document.querySelector('#activateForm .login-btn');
    if (!validateUsername(username) || !email || !password) return showLoginError('기존 계정 정보와 새 아이디를 확인해주세요.');

    button.disabled = true;
    button.textContent = '연결 중...';
    authOperationInProgress = true;
    setAuthMessage('');
    try {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const token = await credential.user.getIdToken();
        await postAuthApi(AUTH_API_URLS.activateUsername, { username }, token);
        await auth.signOut();
        document.getElementById('activateForm').reset();
        showAuthMode('login');
        document.getElementById('usernameInput').value = username;
        setAuthMessage('아이디 연결이 완료되었습니다. 이제 아이디로 로그인해주세요.', 'success');
    } catch (error) {
        if (auth.currentUser) await auth.signOut().catch(() => {});
        const messages = {
            'username-already-exists': '이미 사용 중인 아이디입니다.',
            'username-already-linked': '이 계정은 이미 아이디와 연결되어 있습니다.',
            'employee-not-found': 'Authentication 계정과 일치하는 employees 문서가 없습니다.',
        };
        showLoginError(messages[error.code] || getAuthErrorMessage(error));
    } finally {
        authOperationInProgress = false;
        button.disabled = false;
        button.textContent = '아이디 연결';
    }
}

async function fetchCurrentUserProfile(user) {
    const token = await user.getIdToken();
    const result = await postAuthApi(AUTH_API_URLS.profile, {}, token);
    await user.getIdToken(true);
    return result.profile;
}

async function enterApp(profile) {
    currentUser = profile;
    selectedUnit = currentUser.unit || '1제대';
    document.getElementById('unitSelect').value = selectedUnit;
    document.getElementById('unitSelectorContainer').style.display = currentUser.role === 'admin' ? 'block' : 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').classList.add('active');
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserRole').textContent = currentUser.role === 'admin' ? '관리자' : '직원';
    document.getElementById('adminTabs').style.display = currentUser.role === 'admin' ? 'flex' : 'none';

    await loadEmployeesFromDB();
    renderCalendar();
    await loadSettingsFromFirebase();
    setupRealtimeSync();
    if (typeof loadTelegramSettings === 'function') await loadTelegramSettings({ syncSchedule: true });
    setAuthMessage('');
}

function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    auth.signOut().catch((error) => {
        console.error('로그아웃 실패:', error);
        alert('로그아웃 중 오류가 발생했습니다.');
    });
}

auth.onAuthStateChanged(async (user) => {
    if (authOperationInProgress) return;
    if (!user) {
        currentUser = null;
        const loginPassword = document.getElementById('passwordInput');
        if (loginPassword) loginPassword.value = '';
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').classList.remove('active');
        document.getElementById('unitSelectorContainer').style.display = 'none';
        document.getElementById('adminTabs').style.display = 'none';
        leaves = {};
        maxCapacity = {};
        employees = [];
        return;
    }

    try {
        await enterApp(await fetchCurrentUserProfile(user));
        console.log('✓ 아이디 로그인 성공:', currentUser.username || currentUser.name);
    } catch (error) {
        console.error('사용자 프로필 확인 실패:', error);
        await auth.signOut();
        showLoginError('계정 프로필을 확인할 수 없습니다. 관리자에게 문의해주세요.');
    }
});

async function loadEmployeesFromDB() {
    if (!currentUser || currentUser.role !== 'admin') {
        employees = currentUser ? [{
            uid: currentUser.uid,
            username: currentUser.username || '',
            name: currentUser.name,
            team: currentUser.team || '미지정',
            hierarchy: Number(currentUser.hierarchy) || 999,
        }] : [];
        return employees;
    }

    try {
        const snapshot = await db.collection('employees').where('unit', '==', selectedUnit).get();
        employees = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.role === 'employee') {
                employees.push({
                    uid: data.authUid || doc.id,
                    username: data.username || '',
                    name: data.name,
                    team: data.team || '미지정',
                    hierarchy: Number(data.hierarchy) || 999,
                });
            }
        });
        employees.sort((a, b) => a.team.localeCompare(b.team, 'ko', { numeric: true }) || a.hierarchy - b.hierarchy || a.name.localeCompare(b.name, 'ko'));
        return employees;
    } catch (error) {
        console.error('직원 로드 실패:', error);
        return [];
    }
}
