// ========================================
// 텔레그램 전송 설정은 config.js에서 읽습니다.
// GitHub Pages 배포 시 GitHub Actions Secrets 값이 config.js에 주입됩니다.
// ========================================
const TELEGRAM_BOT_TOKEN = firebaseConfig.telegramBotToken;
const TELEGRAM_CHAT_ID = firebaseConfig.telegramChatId;

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
      telegramScheduledTime = setting.enabled ? setting.dailyTime || "" : "";
      if (scheduleTimeInput) scheduleTimeInput.value = telegramScheduledTime;
    }
  } catch (error) {
    console.warn("텔레그램 정기 전송 설정을 불러오지 못했습니다.", error);
  }
}

function saveTelegramChangeNotifySetting(enabled) {
  telegramChangeNotifyEnabled = Boolean(enabled);
  localStorage.setItem("telegram_notify_on_change", String(telegramChangeNotifyEnabled));
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
function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("텔레그램 토큰 또는 채팅 ID가 config.js에 없습니다.");
    return Promise.resolve(null);
  }

  return fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.ok) {
        console.log("✅ 텔레그램 알림 전송 성공");
      } else {
        console.error("❌ 텔레그램 알림 전송 실패", data);
      }
      return data;
    })
    .catch((err) => {
      console.error("❌ 텔레그램 요청 오류", err);
      return null;
    });
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
    const listStr = groups[key].map((u) => (u.detail ? `${u.emp}[${u.detail}]` : u.emp)).join(", ");
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

async function saveLeave() {
  if (!selectedDate) return;

  // 당직 관련 reason들
  const dutyReasons = ["personal_duty", "personal_rest", "multi_duty", "multi_rest", "etc"];

  // ⚠️ 저장 시에는 편집 중인 고유 데이터(editingLeaves)를 사용함
  const leaveData = editingLeaves || {};
  console.log("저장 시도 데이터:", leaveData);

  const capacity = maxCapacity[selectedDate] || defaultMaxCapacity;
  const nonDutyCount = Object.values(leaveData).filter((reason) => {
    const val = typeof reason === "object" ? reason.label : reason;
    return !dutyReasons.includes(val);
  }).length;

  // 정원 초과 체크도 nonDutyCount 기준으로
  if (nonDutyCount > capacity) {
    alert(`최대 인원(${capacity}명)을 초과할 수 없습니다`);
    return;
  }

  try {
    const [year, month, day] = selectedDate.split("-");
    const yearMonth = `${year}-${month}`;
    const docId = `${selectedUnit}_${yearMonth}`;

    const updateData = {
      updatedAt: new Date().toISOString(),
      updatedBy: (currentUser && currentUser.name) || "Unknown",
    };

    const changesList = [];
    const historyLog = [];

    // ⚠️ [핵심] 영화관 좌석처럼 충돌 방지를 위한 정밀 업데이트 (Granular Update)
    // 1. 추가되거나 수정된 사람만 찾기
    Object.keys(editingLeaves).forEach((empName) => {
      const currentEdit = editingLeaves[empName];
      const original = originalLeaves[empName];

      // 원본에 없거나 데이터가 바뀐 경우만 전송
      if (JSON.stringify(currentEdit) !== JSON.stringify(original)) {
        updateData[`days.${day}.${empName}`] = currentEdit;

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
        updateData[`days.${day}.${empName}`] = firebase.firestore.FieldValue.delete();
        changesList.push(`${empName}: 삭제됨`);
        historyLog.push({ type: "delete", empName, reason: "삭제됨" });
      }
    });

    try {
      // ⚠️ 변경 사항이 하나라도 있을 때만 DB 작업 수행 (불필요 트래픽 방지)
      const changes = Object.keys(updateData).filter((k) => k.startsWith("days."));

      if (changes.length > 0) {
        // 문서가 없을 수도 있으니 기본 틀부터 생성(있는 경우 그대로 둠)
        await db.collection("leaves").doc(docId).set(
          {
            unit: selectedUnit,
            month: yearMonth,
          },
          { merge: true }
        );

        // 정밀하게 딱 바뀐 필드(사람)만 업데이트! (여기서 충돌이 방지됨)
        await db.collection("leaves").doc(docId).update(updateData);

        // 변동 내역 이력(History) 저장
        try {
          const today = new Date();
          // 로컬 타임존 반영된 날짜 문자열(YYYY-MM-DD)
          const offset = today.getTimezoneOffset() * 60000;
          const localDateStr = new Date(today - offset).toISOString().split("T")[0];
          const historyDocId = `${selectedUnit}_${localDateStr}`;

          const changeEntry = {
            timestamp: new Date().toISOString(),
            by: (currentUser && currentUser.name) || "Unknown",
            leaveDate: selectedDate,
            changes: historyLog,
          };

          console.log("변동 이력 저장 시도:", historyDocId, changeEntry);

          await db
            .collection("leave_history")
            .doc(historyDocId)
            .set(
              {
                date: localDateStr,
                unit: selectedUnit,
                logs: firebase.firestore.FieldValue.arrayUnion(changeEntry),
              },
              { merge: true }
            );

          console.log("✓ 변동 이력 저장 성공!");
        } catch (historyError) {
          console.error("❌ 변동 이력 저장 실패 (보안 규칙 등을 확인하세요):", historyError);
          alert(
            "⚠️ 경고: 연가 데이터는 저장되었으나, 변경 이력 기록에 실패했습니다.\n(Firebase Firestore 보안 규칙 등 권한 확인이 필요합니다)\n\n에러 메시지: " +
              historyError.message
          );
        }

        // 사용자에게 알림
        const summaryText = `[${selectedDate}] 연가 변동사항:\n` + changesList.join("\n");
        alert("저장 완료\n\n" + summaryText);

        // 텔레그램 변동사항 알림 전송 (ON일 때만)
        if (telegramChangeNotifyEnabled) {
          const dateObj = new Date(selectedDate + "T00:00:00");
          const dateDisplay = dateObj.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
          const actor = (currentUser && currentUser.name) || "관리자";
          let telegramMessage = `🔔 <b>[${selectedUnit}] 연가 변동사항</b>\n`;
          telegramMessage += `📅 대상일: ${dateDisplay}\n`;
          telegramMessage += `👤 작업자: ${actor}\n`;
          telegramMessage += `──────────────────\n`;
          telegramMessage += changesList.join("\n");
          sendTelegramMessage(telegramMessage);
        }
      }

      // 전역 메모리 최신화 (성공 시에만)
      if (Object.keys(editingLeaves).length === 0) {
        delete leaves[selectedDate];
      } else {
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
    alert("데이터 저장 중 오류가 발생했습니다");
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
    await db.collection("settings").doc(`maxCapacity_${selectedUnit}`).set(maxCapacity, { merge: true });
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

    if (Object.keys(maxCapacity).length === 0) {
      await db.collection("settings").doc(`maxCapacity_${selectedUnit}`).delete();
    } else {
      await db.collection("settings").doc(`maxCapacity_${selectedUnit}`).set(maxCapacity);
    }

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

    if (Object.keys(teamQuotas).length === 0) {
      await db.collection("settings").doc(`teamQuota_${selectedUnit}`).delete();
    } else {
      await db.collection("settings").doc(`teamQuota_${selectedUnit}`).set(teamQuotas);
    }
    console.log(`✓ [${selectedUnit}] 팀 정원 메모 저장됨:`, dateStr, memo);
  } catch (error) {
    console.error("❌ 메모 저장 실패:", error);
  }
}
