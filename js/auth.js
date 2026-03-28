// ========================================
// 로그인/로그아웃 함수 (Firebase Authentication)
// 이름 + 비밀번호로 로그인
// ========================================


// 1. 로그인
async function login() {
    // 1) 입력값 받기
    const name = document.getElementById('nameInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const loginBtn = document.querySelector('.login-btn');

    if (!name || !password) {
        showLoginError('이름과 비밀번호를 모두 입력하세요');
        return;
    }

    // 로딩 상태
    loginBtn.disabled = true;
    loginBtn.textContent = '로그인 중...';

    try {
        // 2) 이름 조회
        // 📌 Step 1: 이름으로 직원 조회 (Firestore)
        const employeesSnapshot = await db.collection('employees')
            .where('name', '==', name)
            .get();

        if (employeesSnapshot.empty) {
            showLoginError('등록되지 않은 이름입니다');
            loginBtn.disabled = false;
            loginBtn.textContent = '로그인';
            return;
        }

        // 3) 이름 똑같은 사람 있으면 이메일 들고오기
        const userDoc = employeesSnapshot.docs[0];
        const userData = userDoc.data();
        const uid = userDoc.id;
        const email = userData.email;


        // 4) 이메일 들고와서 로그인 해보기
        // 📌 Step 2: Firebase Auth로 이메일/비번 인증
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);

            currentUser = {
                uid: uid,
                email: email,
                name: userData.name,
                role: userData.role,
                unit: userData.unit || '1제대',
                team: userData.team || '미지정'
            };

            selectedUnit = currentUser.unit;
            document.getElementById('unitSelect').value = selectedUnit;
            document.getElementById('unitSelectorContainer').style.display = 'block';

            console.log('✓ 로그인 성공:', currentUser.name);

            // 5) 현출
            // UI 업데이트
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').classList.add('active');
            document.getElementById('currentUserName').textContent = currentUser.name;
            document.getElementById('currentUserRole').textContent =
                currentUser.role === 'admin' ? '관리자' : '직원';

            // 관리자만 설정 탭 표시
            if (currentUser.role === 'admin') {
                document.getElementById('adminTabs').style.display = 'flex';
            }

            // 데이터 로드
            await loadEmployeesFromDB(); // db에서 이름 들고오기
            renderCalendar(); // 캘린더 현출
            await loadLeavesFromFirebase(); // config에 있는 전역변수에 저장
            await loadSettingsFromFirebase(); // config에 있는 전역변수에 저장
            setupRealtimeSync();

            // 로그인 실패 메시지 초기화
            document.getElementById('loginError').style.display = 'none';

        } catch (authError) {
            // 비밀번호 오류
            if (authError.code === 'auth/wrong-password') {
                showLoginError('비밀번호가 잘못되었습니다');
            } else {
                showLoginError('로그인 실패: ' + authError.message);
            }
        }

    } catch (error) {
        console.error('❌ 로그인 실패:', error.message);
        showLoginError('로그인 중 오류가 발생했습니다');

    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
    }
}

function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
        auth.signOut().then(() => {
            currentUser = null;
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('app').classList.remove('active');
            document.getElementById('nameInput').value = '';
            document.getElementById('passwordInput').value = '';
            document.getElementById('loginError').style.display = 'none';
            document.getElementById('unitSelectorContainer').style.display = 'none';
            selectedUnit = '1제대';
            document.getElementById('unitSelect').value = selectedUnit;
            leaves = {};
            maxCapacity = {};
            employees = [];
            console.log('✓ 로그아웃됨');
        }).catch(error => {
            console.error('로그아웃 실패:', error);
            alert('로그아웃 중 오류가 발생했습니다');
        });
    }
}

// 페이지 로드 시 로그인 상태 확인
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // 이미 로그인한 사용자
        try {
            const employeesSnapshot = await db.collection('employees')
                .where('email', '==', user.email)
                .get();

            if (!employeesSnapshot.empty) {
                const userDoc = employeesSnapshot.docs[0];
                const userData = userDoc.data();

                currentUser = {
                    uid: userDoc.id,
                    email: user.email,
                    name: userData.name,
                    role: userData.role,
                    unit: userData.unit || '1제대',
                    team: userData.team || '미지정'
                };

                selectedUnit = currentUser.unit;
                document.getElementById('unitSelect').value = selectedUnit;
                document.getElementById('unitSelectorContainer').style.display = 'block';

                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('app').classList.add('active');
                document.getElementById('currentUserName').textContent = currentUser.name;
                document.getElementById('currentUserRole').textContent =
                    currentUser.role === 'admin' ? '관리자' : '직원';

                if (currentUser.role === 'admin') {
                    document.getElementById('adminTabs').style.display = 'flex';
                }

                await loadEmployeesFromDB();
                renderCalendar();
                await loadLeavesFromFirebase();
                await loadSettingsFromFirebase();
                setupRealtimeSync();

                console.log('✓ 세션 유지:', currentUser.name);
            }
        } catch (error) {
            console.error('세션 확인 실패:', error);
        }
    } else {
        // 로그아웃 상태
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').classList.remove('active');
    }
});

// 📌 DB에서 선택된 제대 직원 로드
async function loadEmployeesFromDB() {
    try {
        const snapshot = await db.collection('employees')
            .where('unit', '==', selectedUnit)
            .get();
        employees = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.role === 'employee') {
                employees.push({ name: data.name, team: data.team || '미지정' });
            }
        });

        console.log(`✓ [${selectedUnit}] 직원 데이터 로드 완료:`, employees.length, '명');
        return employees;
    } catch (error) {
        console.error('❌ 직원 로드 실패:', error);
        return [];
    }
}