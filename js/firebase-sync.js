// ========================================
// Firebase 저장/로드/동기화 함수
// ========================================

let leavesUnsubscribe = null;
let settingsUnsubscribe = null;
let employeesUnsubscribe = null;
let teamQuotaUnsubscribe = null;

async function saveLeave() {
    if (!selectedDate) return;

    // 당직 관련 reason들
    const dutyReasons = ['personal_duty', 'personal_rest', 'multi_duty', 'multi_rest', 'etc'];

    // ⚠️ 저장 시에는 편집 중인 고유 데이터(editingLeaves)를 사용함
    const leaveData = editingLeaves || {};
    console.log("저장 시도 데이터:", leaveData);

    const capacity = maxCapacity[selectedDate] || defaultMaxCapacity;
    const nonDutyCount = Object.values(leaveData)
        .filter(reason => {
            const val = typeof reason === 'object' ? reason.label : reason;
            return !dutyReasons.includes(val);
        })
        .length;

    // 정원 초과 체크도 nonDutyCount 기준으로
    if (nonDutyCount > capacity) {
        alert(`최대 인원(${capacity}명)을 초과할 수 없습니다`);
        return;
    }

    try {
        const [year, month, day] = selectedDate.split('-');
        const yearMonth = `${year}-${month}`;
        const docId = `${selectedUnit}_${yearMonth}`;

        const updateData = {
            updatedAt: new Date().toISOString(),
            updatedBy: (currentUser && currentUser.name) || 'Unknown'
        };

        // ⚠️ [핵심] 영화관 좌석처럼 충돌 방지를 위한 정밀 업데이트 (Granular Update)
        // 1. 추가되거나 수정된 사람만 찾기
        Object.keys(editingLeaves).forEach(empName => {
            const currentEdit = editingLeaves[empName];
            const original = originalLeaves[empName];

            // 원본에 없거나 데이터가 바뀐 경우만 전송
            if (JSON.stringify(currentEdit) !== JSON.stringify(original)) {
                updateData[`days.${day}.${empName}`] = currentEdit;
            }
        });

        // 2. 삭제(취소)된 사람만 찾기
        Object.keys(originalLeaves).forEach(empName => {
            if (!editingLeaves[empName]) {
                updateData[`days.${day}.${empName}`] = firebase.firestore.FieldValue.delete();
            }
        });

        try {
            // ⚠️ 변경 사항이 하나라도 있을 때만 DB 작업 수행 (불필요 트래픽 방지)
            const changes = Object.keys(updateData).filter(k => k.startsWith('days.'));

            if (changes.length > 0) {
                // 문서가 없을 수도 있으니 기본 틀부터 생성(있는 경우 그대로 둠)
                await db.collection('leaves').doc(docId).set({
                    unit: selectedUnit,
                    month: yearMonth
                }, { merge: true });

                // 정밀하게 딱 바뀐 필드(사람)만 업데이트! (여기서 충돌이 방지됨)
                await db.collection('leaves').doc(docId).update(updateData);
            }

            // 전역 메모리 최신화 (성공 시에만)
            if (Object.keys(editingLeaves).length === 0) {
                delete leaves[selectedDate];
            } else {
                leaves[selectedDate] = JSON.parse(JSON.stringify(editingLeaves));
            }

            console.log('✓ 정밀 업데이트가 서버에 반영되었습니다:', changes.length, '명 변경');
        } catch (error) {
            throw error;
        }

        renderCalendar();
        closeModal();
        console.log('✓ Firestore에 저장되었습니다');
    } catch (error) {
        console.error('❌ 저장 실패:', error);
        alert('데이터 저장 중 오류가 발생했습니다');
    }
}

// 📌 Firestore에서 모든 연가 데이터 로드
async function loadLeavesFromFirebase() {
    try {
        const snapshot = await db.collection('leaves').where('unit', '==', selectedUnit).get();
        leaves = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const yearMonth = data.month;
            if (data.days) {
                for (const [day, employees] of Object.entries(data.days)) {
                    leaves[`${yearMonth}-${day}`] = employees;
                }
            }
        });
        console.log(`✓ [${selectedUnit}] Firestore에서 연가 데이터 로드 완료 (월별 그룹화 적용)`);
        renderCalendar();
    } catch (error) {
        console.error('❌ 연가 데이터 로드 실패:', error);
    }
}

// 📌 Firestore에서 설정값 로드
async function loadSettingsFromFirebase() {
    try {
        const doc = await db.collection('settings').doc(`maxCapacity_${selectedUnit}`).get();
        if (doc.exists) {
            maxCapacity = doc.data();
            console.log(`✓ [${selectedUnit}] 설정값 로드 완료:`, maxCapacity);
        } else {
            maxCapacity = {};
        }

        const quotaDoc = await db.collection('settings').doc(`teamQuota_${selectedUnit}`).get();
        if (quotaDoc.exists) {
            teamQuotas = quotaDoc.data();
        } else {
            teamQuotas = {};
        }

        if (typeof updateSettingsGrid === 'function') updateSettingsGrid();
    } catch (error) {
        console.error('❌ 설정값 로드 실패:', error);
    }
}

// 📌 실시간 동기화 설정
function setupRealtimeSync() {
    // 기존 구독 해제
    if (leavesUnsubscribe) leavesUnsubscribe();
    if (settingsUnsubscribe) settingsUnsubscribe();
    if (employeesUnsubscribe) employeesUnsubscribe();
    if (teamQuotaUnsubscribe) teamQuotaUnsubscribe();

    // 연가 데이터 실시간 동기화
    leavesUnsubscribe = db.collection('leaves')
        .where('unit', '==', selectedUnit)
        .onSnapshot(snapshot => {
            leaves = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const yearMonth = data.month;
                if (data.days) {
                    for (const [day, employees] of Object.entries(data.days)) {
                        leaves[`${yearMonth}-${day}`] = employees;
                    }
                }
            });
            console.log(`🔄 [${selectedUnit}] 연가 데이터 실시간 동기화됨 (월별 그룹화)`);

            // 배경 달력 업데이트
            renderCalendar();

            // 모달 업데이트 (열려 있는 경우)
            // ⚠️ 편집 중(isModalEditing)에는 UI 기반인 leaves 대신 editingLeaves를 쓰므로, 
            // ⚠️ 여기서는 일반 사용자용 화면이나 관리자용 '현재 연가자 목록'의 보조적 업데이트만 수행함.
            if (selectedDate && document.getElementById('leaveModal').classList.contains('active')) {
                if (currentUser && currentUser.role === 'admin') {
                    // 관리자 모달 내부 리스트는 편집 중이 아닐 때만 동기화 데이터 반영 (이미 editingLeaves가 우선임)
                    if (!isModalEditing) updateLeaveItems();
                } else {
                    showEmployeeView();
                }
            }
        }, error => {
            console.error('❌ 연가 데이터 동기화 에러:', error);
        });

    // 설정값 실시간 동기화
    settingsUnsubscribe = db.collection('settings').doc(`maxCapacity_${selectedUnit}`).onSnapshot(doc => {
        if (doc.exists) {
            maxCapacity = doc.data();
        } else {
            maxCapacity = {};
        }
        console.log(`⚙️ [${selectedUnit}] 설정값 실시간 동기화됨`);
        renderCalendar();
        if (typeof updateSettingsGrid === 'function') updateSettingsGrid();
    }, error => {
        console.error('❌ 설정값 동기화 에러:', error);
    });

    // 팀 정원 메모 실시간 동기화
    teamQuotaUnsubscribe = db.collection('settings').doc(`teamQuota_${selectedUnit}`).onSnapshot(doc => {
        if (doc.exists) {
            teamQuotas = doc.data();
        } else {
            teamQuotas = {};
        }
        console.log(`📝 [${selectedUnit}] 팀 정원 메모 동기화됨`);
        renderCalendar();
    }, error => {
        console.error('❌ 팀 정원 메모 동기화 에러:', error);
    });

    // 현재 사용자가 관리자면 직원 목록도 실시간 동기화
    if (currentUser && currentUser.role === 'admin') {
        employeesUnsubscribe = db.collection('employees')
            .where('role', '==', 'employee')
            .where('unit', '==', selectedUnit)
            .onSnapshot(snapshot => {
                employees = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    employees.push({ name: data.name, team: data.team || '미지정' });
                });
                console.log(`👥 [${selectedUnit}] 직원 목록 실시간 동기화됨:`, employees.length, '명');

                if (document.getElementById('adminView').style.display === 'block') {
                    renderEmployeeList();
                }
            }, error => {
                console.error('❌ 직원 목록 동기화 에러:', error);
            });
    }
}

// 📌 Firestore에 새 설정값 저장
async function saveSettingToFirebase(dateStr, capacity) {
    try {
        maxCapacity[dateStr] = capacity;
        await db.collection('settings').doc(`maxCapacity_${selectedUnit}`).set(maxCapacity, { merge: true });
        console.log(`✓ [${selectedUnit}] 설정값 저장됨:`, dateStr, capacity);
    } catch (error) {
        console.error('❌ 설정값 저장 실패:', error);
        throw error;
    }
}

// 📌 Firestore에서 설정값 삭제
async function deleteSettingFromFirebase(dateStr) {
    try {
        delete maxCapacity[dateStr];

        if (Object.keys(maxCapacity).length === 0) {
            await db.collection('settings').doc(`maxCapacity_${selectedUnit}`).delete();
        } else {
            await db.collection('settings').doc(`maxCapacity_${selectedUnit}`).set(maxCapacity);
        }

        console.log(`✓ [${selectedUnit}] 설정값 삭제됨:`, dateStr);
    } catch (error) {
        console.error('❌ 설정값 삭제 실패:', error);
        throw error;
    }
}

// 📌 Firestore에 팀 메모 저장
async function saveTeamQuotaToFirebase(dateStr, memo) {
    try {
        if (!memo) {
            delete teamQuotas[dateStr];
        } else {
            teamQuotas[dateStr] = memo;
        }

        if (Object.keys(teamQuotas).length === 0) {
            await db.collection('settings').doc(`teamQuota_${selectedUnit}`).delete();
        } else {
            await db.collection('settings').doc(`teamQuota_${selectedUnit}`).set(teamQuotas);
        }
        console.log(`✓ [${selectedUnit}] 팀 정원 메모 저장됨:`, dateStr, memo);
    } catch (error) {
        console.error('❌ 메모 저장 실패:', error);
    }
}
