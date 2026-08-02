// ========================================
// 텔레그램 전송은 인증된 관리자만 Cloud Function을 통해 요청합니다.
// 봇 토큰과 채팅 ID는 브라우저로 내려보내지 않습니다.
// ========================================
const TELEGRAM_NOTIFICATION_URL = `https://asia-northeast3-${firebaseConfig.projectId}.cloudfunctions.net/telegramClientNotification`;

// 변동사항 알림 ON/OFF (localStorage에 저장)
let telegramChangeNotifyEnabled = localStorage.getItem('telegram_notify_on_change') !== 'false';
let telegramScheduledTime = localStorage.getItem('telegram_daily_schedule_time') || '';

function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().split("T")[0];
}

async function loadTelegramSettings() {
  const changeToggle = document.getElementById("telegramChangeNotifyToggle");
  const scheduleTimeInput = document.getElementById("telegramScheduleTime");

  if (changeToggle) changeToggle.checked = telegramChangeNotifyEnabled;
  if (scheduleTimeInput) scheduleTimeInput.value = telegramScheduledTime;

  try {
    const doc = await db.collection("settings").doc("telegram_notification").get();
    if (doc.exists) {
      const setting = doc.data();
      if (typeof setting.changeNotificationsEnabled === "boolean") {
        telegramChangeNotifyEnabled = setting.changeNotificationsEnabled;
        if (changeToggle) changeToggle.checked = telegramChangeNotifyEnabled;
      }
      telegramScheduledTime = setting.enabled ? setting.dailyTime || "" : "";
      if (scheduleTimeInput) scheduleTimeInput.value = telegramScheduledTime;
    }
  } catch (error) {
    console.warn("텔레그램 정기 전송 설정을 불러오지 못했습니다.", error);
  }
}

async function saveTelegramChangeNotifySetting(enabled) {
  const previous = telegramChangeNotifyEnabled;
  telegramChangeNotifyEnabled = Boolean(enabled);
  localStorage.setItem("telegram_notify_on_change", String(telegramChangeNotifyEnabled));
  try {
    await db.collection("settings").doc("telegram_notification").set(
      { changeNotificationsEnabled: telegramChangeNotifyEnabled, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (error) {
    telegramChangeNotifyEnabled = previous;
    const toggle = document.getElementById("telegramChangeNotifyToggle");
    if (toggle) toggle.checked = previous;
    console.error("변경 알림 설정 저장 실패:", error);
    alert("변경 알림 설정을 저장하지 못했습니다.");
  }
}

async function saveTelegramScheduleSetting() {
  const scheduleTimeInput = document.getElementById("telegramScheduleTime");
  const value = scheduleTimeInput ? scheduleTimeInput.value : "";

  if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    alert("정기 전송 시간은 HH:MM 형식으로 설정해주세요.");
    return;
  }

  telegramScheduledTime = value;
  if (telegramScheduledTime) {
    localStorage.setItem("telegram_daily_schedule_time", telegramScheduledTime);
  } else {
    localStorage.removeItem("telegram_daily_schedule_time");
  }
  try {
    await db.collection("settings").doc("telegram_notification").set(
      {
        enabled: Boolean(telegramScheduledTime),
        dailyTime: telegramScheduledTime || null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("텔레그램 정기 전송 설정이 서버에 저장되었습니다.");
  } catch (error) {
    console.error("텔레그램 정기 전송 설정 저장 실패:", error);
    alert("정기 전송 설정을 서버에 저장하지 못했습니다. 관리자 권한과 Firestore 규칙을 확인해주세요.");
  }
}

// 텔레그램 메시지 전송 함수
async function sendTelegramMessage(message) {
  if (!currentUser || currentUser.role !== "admin" || !auth.currentUser) {
    console.error("관리자 로그인 후 텔레그램 알림을 전송할 수 있습니다.");
    return null;
  }

  try {
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(TELEGRAM_NOTIFICATION_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    if (!response.ok) throw new Error(`알림 서버 응답 오류 (${response.status})`);
    console.log("✅ 텔레그램 서버 알림 전송 성공");
    return await response.json();
  } catch (error) {
    console.error("❌ 텔레그램 서버 전송 오류", error);
    return null;
  }
}

// 연결 테스트
async function testTelegramConnection() {
  const btn = document.getElementById("telegramTestBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "전송 중...";
  }

  const result = await sendTelegramMessage("✅ 연가 관리 시스템 텔레그램 연결 테스트 성공!");
  if (btn) {
    if (result && result.ok) {
      btn.textContent = "✅ 성공!";
    } else {
      btn.textContent = "❌ 실패";
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "🔔 연결 테스트";
    }, 3000);
  }
}

// ========================================
// 당일 연가자 상세내역 메시지 생성
// ========================================
function buildTodayDetailMessage(dateStr) {
  const leaveData = leaves[dateStr] || {};

  const labelMap = {
    annual: "연가",
    special: "특가",
    education: "교육",
    sick: "병가",
    out_of_area_travel: "관외",
    compensatory_rest: "대체휴무",
    leave_early_late: "조퇴/지각",
    personal_duty: "개인당직",
    personal_rest: "당직휴무",
    multi_duty: "다목적당직",
    multi_rest: "다당휴무",
    etc: "기타",
  };

  const upperOrder = [
    "annual",
    "special",
    "education",
    "out_of_area_travel",
    "sick",
    "compensatory_rest",
    "leave_early_late",
  ];
  const lowerOrder = ["personal_duty", "personal_rest", "multi_duty", "multi_rest", "etc"];

  const getTeamNum = (teamName) => {
    const num = parseInt((teamName || "").replace(/[^0-9]/g, ""));
    return isNaN(num) ? 999 : num;
  };

  // 사유별 그룹핑
  const groups = {};
  for (const [emp, reasonObj] of Object.entries(leaveData)) {
    const val = typeof reasonObj === "object" ? reasonObj.label : reasonObj;
    const detail = typeof reasonObj === "object" ? reasonObj.reason || "" : "";
    const team = typeof reasonObj === "object" ? reasonObj.team || "미지정" : "미지정";
    const hierarchy = typeof reasonObj === "object" ? reasonObj.hierarchy || 999 : 999;
    if (!groups[val]) groups[val] = [];
    groups[val].push({ emp, detail, team, hierarchy });
  }

  // 팀 -> hierarchy 순 정렬
  Object.keys(groups).forEach((key) => {
    groups[key].sort((a, b) => {
      const teamDiff = getTeamNum(a.team) - getTeamNum(b.team);
      if (teamDiff !== 0) return teamDiff;
      return (a.hierarchy || 999) - (b.hierarchy || 999);
    });
  });

  const formatGroup = (key) => {
    if (!groups[key] || groups[key].length === 0) return "";
    const listStr = groups[key].map((u) =>
      u.detail ? `${escapeTelegramHtml(u.emp)}[${escapeTelegramHtml(u.detail)}]` : escapeTelegramHtml(u.emp)
    ).join(", ");
    return `${labelMap[key] || key} ${groups[key].length}(${listStr})`;
  };

  const upperLines = upperOrder.map(formatGroup).filter(Boolean);
  const lowerLines = lowerOrder.map(formatGroup).filter(Boolean);

  // 날짜 포맷
  const dateObj = new Date(dateStr + "T00:00:00");
  const dateDisplay = dateObj.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });

  let msg = `📋 <b>[${selectedUnit}] ${dateDisplay} 연가자 현황</b>\n`;
  msg += `──────────────────\n`;

  if (upperLines.length > 0) {
    msg += upperLines.join("\n") + "\n";
  }
  if (upperLines.length > 0 && lowerLines.length > 0) {
    msg += "\n";
  }
  if (lowerLines.length > 0) {
    msg += lowerLines.join("\n") + "\n";
  }
  if (upperLines.length === 0 && lowerLines.length === 0) {
    msg += "등록된 연가자가 없습니다.\n";
  }

  const capacity = maxCapacity[dateStr] || defaultMaxCapacity;
  const dutyReasons = ["personal_duty", "personal_rest", "multi_duty", "multi_rest", "etc"];
  const nonDutyCount = Object.values(leaveData).filter((r) => {
    const val = typeof r === "object" ? r.label : r;
    return !dutyReasons.includes(val);
  }).length;

  msg += `──────────────────\n`;
  msg += `📊 연가 인원: ${nonDutyCount}/${capacity}명`;

  return msg;
}

// 당일 연가자 상세내역 텔레그램 전송
async function sendTodayDetailToTelegram(options = {}) {
  const dateStr = getLocalDateString();

  const message = buildTodayDetailMessage(dateStr);

  const btn = document.getElementById("sendTodayDetailBtn");
  if (btn && !options.silent) {
    btn.disabled = true;
    btn.textContent = "전송 중...";
  }

  const result = await sendTelegramMessage(message);

  if (btn && !options.silent) {
    if (result && result.ok) {
      btn.textContent = "✅ 전송 완료!";
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "📤 당일 현황 전송";
      }, 2500);
    } else {
      btn.textContent = "❌ 전송 실패";
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "📤 당일 현황 전송";
      }, 2500);
    }
  }

  return result;
}

document.addEventListener("DOMContentLoaded", () => {
  loadTelegramSettings();
});

let leavesUnsubscribe = null;
let settingsUnsubscribe = null;
let employeesUnsubscribe = null;
let teamQuotaUnsubscribe = null;
let isSavingLeave = false;

function isDutyReason(reason) {
  const value = typeof reason === "object" && reason ? reason.label : reason;
  return ["personal_duty", "personal_rest", "multi_duty", "multi_rest", "etc"].includes(value);
}

function isSameLeaveValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

async function saveLeave() {
  if (!selectedDate || isSavingLeave) return;

  // 당직 관련 reason들
  // ⚠️ 저장 시에는 편집 중인 고유 데이터(editingLeaves)를 사용함
  const leaveData = editingLeaves || {};
  console.log("저장 시도 데이터:", leaveData);

  const capacity = maxCapacity[selectedDate] || defaultMaxCapacity;
  const nonDutyCount = Object.values(leaveData).filter((reason) => {
    return !isDutyReason(reason);
  }).length;

  // 정원 초과 체크도 nonDutyCount 기준으로
  if (nonDutyCount > capacity) {
    alert(`최대 인원(${capacity}명)을 초과할 수 없습니다`);
    return;
  }

  try {
    const changesList = [];
    const historyLog = [];
    const intendedChanges = {};

    // ⚠️ [핵심] 영화관 좌석처럼 충돌 방지를 위한 정밀 업데이트 (Granular Update)
    // 1. 추가되거나 수정된 사람만 찾기
    Object.keys(editingLeaves).forEach((empName) => {
      const currentEdit = editingLeaves[empName];
      const original = originalLeaves[empName];

      // 원본에 없거나 데이터가 바뀐 경우만 전송
      if (JSON.stringify(currentEdit) !== JSON.stringify(original)) {
        intendedChanges[empName] = currentEdit;

        const currentLabel = typeof currentEdit === "object" ? currentEdit.label : currentEdit;
        const reasonObj = leaveReasons.find((r) => r.value === currentLabel);
        const reasonText = reasonObj ? reasonObj.label : currentLabel;

        if (!original) {
          changesList.push(`${empName}: ${reasonText} (추가)`);
        } else {
          changesList.push(`${empName}: ${reasonText} (수정)`);
        }
        historyLog.push({ type: "add_or_update", empName, reason: reasonText });
      }
    });

    // 2. 삭제(취소)된 사람만 찾기
    Object.keys(originalLeaves).forEach((empName) => {
      if (!editingLeaves[empName]) {
        intendedChanges[empName] = null;
        changesList.push(`${empName}: 삭제됨`);
        historyLog.push({ type: "delete", empName, reason: "삭제됨" });
      }
    });

    try {
      // ⚠️ 변경 사항이 하나라도 있을 때만 DB 작업 수행 (불필요 트래픽 방지)
      const changes = Object.keys(intendedChanges);

      if (changes.length > 0) {
        isSavingLeave = true;
        const saveButtons = document.querySelectorAll("#leaveModal .save-btn");
        saveButtons.forEach((button) => (button.disabled = true));

        const [year, month, day] = selectedDate.split("-");
        const yearMonth = `${year}-${month}`;
        const leaveRef = db.collection("leaves").doc(`${selectedUnit}_${yearMonth}`);
        const capacityRef = db.collection("settings").doc(`maxCapacity_${selectedUnit}`);

        const savedDay = await db.runTransaction(async (transaction) => {
          const [leaveSnapshot, capacitySnapshot] = await Promise.all([
            transaction.get(leaveRef),
            transaction.get(capacityRef),
          ]);
          const latestDay = leaveSnapshot.exists ? { ...(leaveSnapshot.data().days?.[day] || {}) } : {};

          for (const empName of changes) {
            if (!isSameLeaveValue(latestDay[empName], originalLeaves[empName])) {
              const conflictError = new Error("동일 직원 정보가 이미 변경되었습니다.");
              conflictError.code = "leave/conflict";
              conflictError.employeeName = empName;
              throw conflictError;
            }
            if (intendedChanges[empName] === null) delete latestDay[empName];
            else latestDay[empName] = intendedChanges[empName];
          }

          const latestCapacity = capacitySnapshot.exists
            ? Number(capacitySnapshot.data()?.[selectedDate]) || defaultMaxCapacity
            : defaultMaxCapacity;
          const latestNonDutyCount = Object.values(latestDay).filter((reason) => !isDutyReason(reason)).length;
          if (latestNonDutyCount > latestCapacity) {
            const capacityError = new Error("정원을 초과했습니다.");
            capacityError.code = "leave/capacity-exceeded";
            capacityError.capacity = latestCapacity;
            throw capacityError;
          }

          transaction.set(leaveRef, {
            unit: selectedUnit,
            month: yearMonth,
            days: { [day]: latestDay },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: (currentUser && currentUser.name) || "Unknown",
          }, { merge: true });

          return latestDay;
        });

        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        const localDateStr = new Date(today - offset).toISOString().split("T")[0];
        const historyRef = db.collection("leave_history").doc(`${selectedUnit}_${localDateStr}`);
        const changeEntry = {
          timestamp: new Date().toISOString(),
          by: (currentUser && currentUser.name) || "Unknown",
          leaveDate: selectedDate,
          changes: historyLog,
        };
        try {
          await historyRef.set({ date: localDateStr, unit: selectedUnit }, { merge: true });
          await historyRef.collection("logs").add(changeEntry);
        } catch (historyError) {
          console.warn("개별 변경 이력 저장 실패, 기존 이력 형식으로 재시도합니다.", historyError);
          await historyRef.set({
            date: localDateStr,
            unit: selectedUnit,
            logs: firebase.firestore.FieldValue.arrayUnion(changeEntry),
          }, { merge: true });
        }

        // 사용자에게 알림
        const summaryText = `[${selectedDate}] 연가 변동사항:\n` + changesList.join("\n");
        alert("저장 완료\n\n" + summaryText);

        leaves[selectedDate] = JSON.parse(JSON.stringify(savedDay));
      }

      // 전역 메모리 최신화 (성공 시에만)
      if (changes.length === 0 && Object.keys(editingLeaves).length === 0) {
        delete leaves[selectedDate];
      } else if (changes.length === 0) {
        leaves[selectedDate] = JSON.parse(JSON.stringify(editingLeaves));
      }

      console.log("✓ 정밀 업데이트가 서버에 반영되었습니다:", changes.length, "명 변경");
    } catch (error) {
      throw error;
    }

    renderCalendar();
    closeModal();
    console.log("✓ Firestore에 저장되었습니다");
  } catch (error) {
    console.error("❌ 저장 실패:", error);
    if (error.code === "leave/conflict") {
      alert(`${error.employeeName || "해당 직원"}님의 정보가 다른 사용자에 의해 변경되었습니다.\n최신 내용을 다시 확인한 뒤 저장해주세요.`);
    } else if (error.code === "leave/capacity-exceeded") {
      alert(`최대 인원(${error.capacity || capacity}명)에 도달했습니다.`);
    } else {
      alert("데이터 저장 중 오류가 발생했습니다");
    }
  } finally {
    isSavingLeave = false;
    document.querySelectorAll("#leaveModal .save-btn").forEach((button) => (button.disabled = false));
  }
}

// 📌 Firestore에서 모든 연가 데이터 로드
async function loadLeavesFromFirebase() {
  try {
    const snapshot = await db.collection("leaves").where("unit", "==", selectedUnit).get();
    leaves = {};

    snapshot.forEach((doc) => {
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
    console.error("❌ 연가 데이터 로드 실패:", error);
  }
}

// 📌 Firestore에서 설정값 로드
async function loadSettingsFromFirebase() {
  try {
    const doc = await db.collection("settings").doc(`maxCapacity_${selectedUnit}`).get();
    if (doc.exists) {
      maxCapacity = doc.data();
      console.log(`✓ [${selectedUnit}] 설정값 로드 완료:`, maxCapacity);
    } else {
      maxCapacity = {};
    }

    const quotaDoc = await db.collection("settings").doc(`teamQuota_${selectedUnit}`).get();
    if (quotaDoc.exists) {
      teamQuotas = quotaDoc.data();
    } else {
      teamQuotas = {};
    }

    if (typeof updateSettingsGrid === "function") updateSettingsGrid();
  } catch (error) {
    console.error("❌ 설정값 로드 실패:", error);
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
  leavesUnsubscribe = db
    .collection("leaves")
    .where("unit", "==", selectedUnit)
    .onSnapshot(
      (snapshot) => {
        leaves = {};
        snapshot.forEach((doc) => {
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
        if (selectedDate && document.getElementById("leaveModal").classList.contains("active")) {
          if (currentUser && currentUser.role === "admin") {
            // 관리자 모달 내부 리스트는 편집 중이 아닐 때만 동기화 데이터 반영 (이미 editingLeaves가 우선임)
            if (!isModalEditing) updateLeaveItems();
          } else {
            showEmployeeView();
          }
        }
      },
      (error) => {
        console.error("❌ 연가 데이터 동기화 에러:", error);
      }
    );

  // 설정값 실시간 동기화
  settingsUnsubscribe = db
    .collection("settings")
    .doc(`maxCapacity_${selectedUnit}`)
    .onSnapshot(
      (doc) => {
        if (doc.exists) {
          maxCapacity = doc.data();
        } else {
          maxCapacity = {};
        }
        console.log(`⚙️ [${selectedUnit}] 설정값 실시간 동기화됨`);
        renderCalendar();
        if (typeof updateSettingsGrid === "function") updateSettingsGrid();
      },
      (error) => {
        console.error("❌ 설정값 동기화 에러:", error);
      }
    );

  // 팀 정원 메모 실시간 동기화
  teamQuotaUnsubscribe = db
    .collection("settings")
    .doc(`teamQuota_${selectedUnit}`)
    .onSnapshot(
      (doc) => {
        if (doc.exists) {
          teamQuotas = doc.data();
        } else {
          teamQuotas = {};
        }
        console.log(`📝 [${selectedUnit}] 팀 정원 메모 동기화됨`);
        renderCalendar();
      },
      (error) => {
        console.error("❌ 팀 정원 메모 동기화 에러:", error);
      }
    );

  // 현재 사용자가 관리자면 직원 목록도 실시간 동기화
  if (currentUser && currentUser.role === "admin") {
    employeesUnsubscribe = db
      .collection("employees")
      .where("role", "==", "employee")
      .where("unit", "==", selectedUnit)
      .onSnapshot(
        (snapshot) => {
          employees = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            employees.push({
              name: data.name,
              team: data.team || "미지정",
              hierarchy: data.hierarchy || 999,
            });
          });
          console.log(`👥 [${selectedUnit}] 직원 목록 실시간 동기화됨:`, employees.length, "명");

          if (document.getElementById("adminView").style.display === "block") {
            renderEmployeeList();
          }
        },
        (error) => {
          console.error("❌ 직원 목록 동기화 에러:", error);
        }
      );
  }
}

// 📌 Firestore에 새 설정값 저장
async function saveSettingToFirebase(dateStr, capacity) {
  try {
    maxCapacity[dateStr] = capacity;
    await db.collection("settings").doc(`maxCapacity_${selectedUnit}`).set({ [dateStr]: capacity }, { merge: true });
    console.log(`✓ [${selectedUnit}] 설정값 저장됨:`, dateStr, capacity);
  } catch (error) {
    console.error("❌ 설정값 저장 실패:", error);
    throw error;
  }
}

// 📌 Firestore에서 설정값 삭제
async function deleteSettingFromFirebase(dateStr) {
  try {
    delete maxCapacity[dateStr];

    await db.collection("settings").doc(`maxCapacity_${selectedUnit}`).set(
      { [dateStr]: firebase.firestore.FieldValue.delete() },
      { merge: true }
    );

    console.log(`✓ [${selectedUnit}] 설정값 삭제됨:`, dateStr);
  } catch (error) {
    console.error("❌ 설정값 삭제 실패:", error);
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

    if (!memo) {
      await db.collection("settings").doc(`teamQuota_${selectedUnit}`).set(
        { [dateStr]: firebase.firestore.FieldValue.delete() },
        { merge: true }
      );
    } else {
      await db.collection("settings").doc(`teamQuota_${selectedUnit}`).set({ [dateStr]: memo }, { merge: true });
    }
    console.log(`✓ [${selectedUnit}] 팀 정원 메모 저장됨:`, dateStr, memo);
  } catch (error) {
    console.error("❌ 메모 저장 실패:", error);
  }
}
