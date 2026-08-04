const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { isDeepStrictEqual } = require("node:util");

initializeApp();

const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const telegramAllowedChatId = defineSecret("TELEGRAM_ALLOWED_CHAT_ID");
const db = getFirestore();
let schedulerClient;

const FUNCTIONS_REGION = "asia-northeast3";
const SCHEDULER_JOB_ID = "telegram-daily-leaves";
const SCHEDULER_CALLER_SERVICE_ACCOUNT = "251474038020-compute@developer.gserviceaccount.com";

const UNITS = ["1제대", "2제대", "3제대"];
const SAVE_UNITS = [...UNITS, "test"];
const DEFAULT_MAX_CAPACITY = 4;
const DUTY_REASONS = new Set(["personal_duty", "personal_rest", "multi_duty", "multi_rest", "etc"]);
const REASON_LABELS = {
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
const UPPER_REASON_ORDER = ["annual", "special", "education", "out_of_area_travel", "sick", "compensatory_rest", "leave_early_late"];
const LOWER_REASON_ORDER = ["personal_duty", "personal_rest", "multi_duty", "multi_rest", "etc"];
const ALLOWED_REASONS = new Set([...UPPER_REASON_ORDER, ...LOWER_REASON_ORDER]);

function getSeoulDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return { date: `${value.year}-${value.month}-${value.day}`, time };
}

function getSeoulDate() {
  return getSeoulDateTime().date;
}

function getNextDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + 1));
  return value.toISOString().slice(0, 10);
}

function getTeamNumber(teamName) {
  const value = Number.parseInt(String(teamName || "").replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(value) ? 999 : value;
}

function buildUnitTodayLeavesMessage(date, unit, entries, capacity) {
  const grouped = {};
  for (const [name, raw] of Object.entries(entries || {})) {
    const reason = typeof raw === "object" ? raw.label : raw;
    const detail = typeof raw === "object" ? raw.reason || "" : "";
    const team = typeof raw === "object" ? raw.team || "미지정" : "미지정";
    const hierarchy = typeof raw === "object" ? raw.hierarchy || 999 : 999;
    if (!grouped[reason]) grouped[reason] = [];
    grouped[reason].push({ name, detail, team, hierarchy });
  }

  for (const people of Object.values(grouped)) {
    people.sort((a, b) => getTeamNumber(a.team) - getTeamNumber(b.team) || a.hierarchy - b.hierarchy);
  }

  const formatGroup = (reason) => {
    const people = grouped[reason];
    if (!people?.length) return "";
    const names = people.map(({ name, detail }) =>
      detail ? `${escapeTelegramHtml(name)}[${escapeTelegramHtml(detail)}]` : escapeTelegramHtml(name)
    ).join(", ");
    return `${REASON_LABELS[reason] || reason} ${people.length}(${names})`;
  };

  const upperLines = UPPER_REASON_ORDER.map(formatGroup).filter(Boolean);
  const lowerLines = LOWER_REASON_ORDER.map(formatGroup).filter(Boolean);
  const dateDisplay = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00+09:00`));
  const leaveCount = Object.values(entries || {}).filter((raw) => !DUTY_REASONS.has(typeof raw === "object" ? raw.label : raw)).length;
  const lines = upperLines.length || lowerLines.length ? [...upperLines, ...(upperLines.length && lowerLines.length ? [""] : []), ...lowerLines] : ["등록된 연가자가 없습니다."];

  return `📋 <b>[${escapeTelegramHtml(unit)}] ${dateDisplay} 연가자 현황</b>\n──────────────────\n${lines.join("\n")}\n──────────────────\n📊 연가 인원: ${leaveCount}/${capacity}명`;
}

async function buildLeavesMessage(date) {
  const [year, month, day] = date.split("-");
  const snapshots = await Promise.all(
    UNITS.map(async (unit) => {
      const [leaveSnapshot, capacitySnapshot] = await Promise.all([
        db.collection("leaves").doc(`${unit}_${year}-${month}`).get(),
        db.collection("settings").doc(`maxCapacity_${unit}`).get(),
      ]);
      return { unit, leaveSnapshot, capacitySnapshot };
    })
  );

  const sections = snapshots.map(({ unit, leaveSnapshot, capacitySnapshot }) => {
    const entries = leaveSnapshot.exists ? leaveSnapshot.data().days?.[day] || {} : {};
    const configuredCapacity = capacitySnapshot.exists ? Number(capacitySnapshot.data()?.[date]) : 0;
    return buildUnitTodayLeavesMessage(date, unit, entries, configuredCapacity || DEFAULT_MAX_CAPACITY);
  });

  return sections.join("\n\n");
}

async function buildTodayLeavesMessage() {
  return buildLeavesMessage(getSeoulDate());
}

async function buildTomorrowLeavesMessage() {
  return buildLeavesMessage(getNextDate(getSeoulDate()));
}

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken.value().trim()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status}`);
}

async function getVerifiedEmployee(request) {
  const token = request.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("Missing authorization token");

  const decodedToken = await getAuth().verifyIdToken(token);
  // The client signs in with the email stored in employees.  Employee document
  // IDs are not guaranteed to be Firebase Auth UIDs, so look up the document
  // by the verified token's email rather than assuming its document ID.
  if (!decodedToken.email) throw new Error("Authenticated user has no email");
  const employees = await db
    .collection("employees")
    .where("email", "==", decodedToken.email)
    .limit(1)
    .get();
  const employee = employees.docs[0];
  if (!employee) throw new Error("Registered employee not found");
  return { decodedToken, employee: { id: employee.id, ...employee.data() } };
}

async function getVerifiedAdmin(request) {
  const verified = await getVerifiedEmployee(request);
  if (verified.employee.role !== "admin") {
    throw new Error("Administrator permission required");
  }
  return verified;
}

function getSchedulerNames() {
  if (!schedulerClient) {
    const { CloudSchedulerClient } = require("@google-cloud/scheduler");
    schedulerClient = new CloudSchedulerClient();
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error("Google Cloud project ID is unavailable");
  const parent = schedulerClient.locationPath(projectId, FUNCTIONS_REGION);
  const name = schedulerClient.jobPath(projectId, FUNCTIONS_REGION, SCHEDULER_JOB_ID);
  const targetUrl = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/sendScheduledDailyLeavesV2`;
  return { parent, name, targetUrl };
}

async function updateDedicatedTelegramJob(enabled, dailyTime) {
  const { parent, name, targetUrl } = getSchedulerNames();
  const [hour = "0", minute = "0"] = (dailyTime || "00:00").split(":");
  const schedule = `${Number(minute)} ${Number(hour)} * * *`;
  const httpTarget = {
    uri: targetUrl,
    httpMethod: "POST",
    headers: { "Content-Type": "application/json" },
    body: Buffer.from(JSON.stringify({ source: "telegram-daily-leaves" })),
    oidcToken: {
      serviceAccountEmail: SCHEDULER_CALLER_SERVICE_ACCOUNT,
      audience: targetUrl,
    },
  };

  let existing = null;
  try {
    [existing] = await schedulerClient.getJob({ name });
  } catch (error) {
    if (Number(error.code) !== 5) throw error;
  }

  if (!existing) {
    [existing] = await schedulerClient.createJob({
      parent,
      job: { name, schedule, timeZone: "Asia/Seoul", httpTarget },
    });
  } else {
    [existing] = await schedulerClient.updateJob({
      job: { name, schedule, timeZone: "Asia/Seoul", httpTarget },
      updateMask: { paths: ["schedule", "time_zone", "http_target"] },
    });
  }

  const isPaused = existing.state === "PAUSED" || Number(existing.state) === 2;
  if (enabled && isPaused) {
    await schedulerClient.resumeJob({ name });
  } else if (!enabled && !isPaused) {
    await schedulerClient.pauseJob({ name });
  }
}

exports.updateTelegramSchedule = onRequest(
  { region: FUNCTIONS_REGION, invoker: "public", cors: true },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ ok: false });

    let employee;
    try {
      ({ employee } = await getVerifiedAdmin(req));
    } catch (error) {
      return res.status(403).json({ ok: false, code: "admin-required" });
    }

    try {
      const dailyTime = typeof req.body?.dailyTime === "string" ? req.body.dailyTime.trim() : "";
      const enabled = Boolean(req.body?.enabled && dailyTime);
      if (dailyTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) {
        return res.status(400).json({ ok: false, code: "invalid-time" });
      }

      await updateDedicatedTelegramJob(enabled, dailyTime);
      await db.collection("settings").doc("telegram_notification").set(
        {
          enabled,
          dailyTime: enabled ? dailyTime : null,
          scheduleMode: "dedicated-cloud-scheduler",
          updatedAt: new Date().toISOString(),
          updatedBy: employee.name,
        },
        { merge: true }
      );
      return res.status(200).json({ ok: true, enabled, dailyTime: enabled ? dailyTime : null });
    } catch (error) {
      console.error("Telegram schedule update failed", error);
      return res.status(500).json({ ok: false, code: "schedule-update-failed" });
    }
  }
);

function validateLeaveValue(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !ALLOWED_REASONS.has(value.label)) {
    throw new Error("Invalid leave value");
  }
  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 200) : "";
  const team = typeof value.team === "string" ? value.team.trim().slice(0, 40) : "미지정";
  const hierarchy = Number.isFinite(Number(value.hierarchy)) ? Number(value.hierarchy) : 999;
  return { label: value.label, reason, team: team || "미지정", hierarchy };
}

function escapeTelegramHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

exports.getCurrentUserProfile = onRequest(
  { region: "asia-northeast3", invoker: "public", cors: true },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ ok: false });
    try {
      const { decodedToken, employee } = await getVerifiedEmployee(req);
      await getAuth().setCustomUserClaims(decodedToken.uid, {
        role: employee.role,
        unit: employee.unit || "1제대",
      });
      return res.status(200).json({
        ok: true,
        profile: {
          uid: employee.id,
          email: decodedToken.email,
          name: employee.name,
          role: employee.role,
          unit: employee.unit || "1제대",
          team: employee.team || "미지정",
          hierarchy: Number(employee.hierarchy) || 999,
        },
      });
    } catch (error) {
      console.error("Profile lookup failed", error);
      return res.status(403).json({ ok: false });
    }
  }
);

exports.saveLeaveChanges = onRequest(
  {
    region: "asia-northeast3",
    invoker: "public",
    cors: true,
    maxInstances: 10,
    secrets: [telegramBotToken, telegramAllowedChatId],
  },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ ok: false });
    try {
      const { employee } = await getVerifiedEmployee(req);
      const { date, unit, changes } = req.body || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !SAVE_UNITS.includes(unit) || !Array.isArray(changes)) {
        return res.status(400).json({ ok: false, code: "invalid-request" });
      }
      if (changes.length < 1 || changes.length > 100) {
        return res.status(400).json({ ok: false, code: "invalid-changes" });
      }
      if (employee.role !== "admin" && (employee.unit !== unit || changes.some((change) => change.name !== employee.name))) {
        return res.status(403).json({ ok: false, code: "permission-denied" });
      }

      const [year, month, day] = date.split("-");
      const yearMonth = `${year}-${month}`;
      const leaveRef = db.collection("leaves").doc(`${unit}_${yearMonth}`);
      const capacityRef = db.collection("settings").doc(`maxCapacity_${unit}`);
      const notificationRef = db.collection("settings").doc("telegram_notification");
      const now = getSeoulDateTime();
      const historyRef = db.collection("leave_history").doc(`${unit}_${now.date}`);
      const logRef = historyRef.collection("logs").doc();

      const transactionResult = await db.runTransaction(async (transaction) => {
        const [leaveSnapshot, capacitySnapshot, notificationSnapshot] = await Promise.all([
          transaction.get(leaveRef),
          transaction.get(capacityRef),
          transaction.get(notificationRef),
        ]);
        const latestDay = leaveSnapshot.exists ? { ...(leaveSnapshot.data().days?.[day] || {}) } : {};
        const historyChanges = [];

        for (const change of changes) {
          if (!change || typeof change.name !== "string" || change.name.length > 80) throw new Error("Invalid employee name");
          if (!isDeepStrictEqual(latestDay[change.name] ?? null, change.expected ?? null)) {
            const conflict = new Error("Leave entry changed");
            conflict.code = "leave/conflict";
            conflict.employeeName = change.name;
            throw conflict;
          }

          let next = validateLeaveValue(change.next ?? null);
          if (employee.role !== "admin" && next) {
            next = {
              ...next,
              team: employee.team || "미지정",
              hierarchy: Number(employee.hierarchy) || 999,
            };
          }
          if (next === null) delete latestDay[change.name];
          else latestDay[change.name] = next;
          historyChanges.push({
            type: next === null ? "delete" : "add_or_update",
            empName: change.name,
            reason: next === null ? "삭제됨" : REASON_LABELS[next.label] || next.label,
          });
        }

        const capacity = capacitySnapshot.exists
          ? Number(capacitySnapshot.data()?.[date]) || DEFAULT_MAX_CAPACITY
          : DEFAULT_MAX_CAPACITY;
        const leaveCount = Object.values(latestDay).filter((value) => !DUTY_REASONS.has(value?.label || value)).length;
        if (leaveCount > capacity) {
          const capacityError = new Error("Capacity exceeded");
          capacityError.code = "leave/capacity-exceeded";
          capacityError.capacity = capacity;
          throw capacityError;
        }

        transaction.set(
          leaveRef,
          { unit, month: yearMonth, days: { [day]: latestDay }, updatedAt: new Date().toISOString(), updatedBy: employee.name },
          { merge: true }
        );
        transaction.set(logRef, {
          timestamp: new Date().toISOString(),
          by: employee.name,
          leaveDate: date,
          changes: historyChanges,
        });
        return {
          savedDay: latestDay,
          historyChanges,
          notifyChanges: !notificationSnapshot.exists || notificationSnapshot.data().changeNotificationsEnabled !== false,
        };
      });

      if (transactionResult.notifyChanges) {
        try {
          const lines = transactionResult.historyChanges.map((change) =>
            `${escapeTelegramHtml(change.empName)}: ${escapeTelegramHtml(change.reason)} (${change.type === "delete" ? "삭제" : "설정"})`
          );
          const message = `🔔 <b>[${escapeTelegramHtml(unit)}] 연가 변동사항</b>\n📅 대상일: ${date}\n👤 작업자: ${escapeTelegramHtml(employee.name)}\n──────────────────\n${lines.join("\n")}`;
          await sendTelegramMessage(telegramAllowedChatId.value().trim(), message);
        } catch (notificationError) {
          console.error("Leave change notification failed", notificationError);
        }
      }

      return res.status(200).json({ ok: true, day: transactionResult.savedDay });
    } catch (error) {
      console.error("Leave save failed", error);
      if (error.code === "leave/conflict") {
        return res.status(409).json({ ok: false, code: error.code, employeeName: error.employeeName });
      }
      if (error.code === "leave/capacity-exceeded") {
        return res.status(409).json({ ok: false, code: error.code, capacity: error.capacity });
      }
      return res.status(403).json({ ok: false, code: "save-failed" });
    }
  }
);

// 브라우저의 관리자 화면이 보내는 알림을 처리합니다. 토큰·채팅 ID는 서버 시크릿으로만 사용합니다.
exports.telegramClientNotification = onRequest(
  {
    region: "asia-northeast3",
    invoker: "public",
    cors: true,
    secrets: [telegramBotToken, telegramAllowedChatId],
  },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ ok: false });

    try {
      await getVerifiedAdmin(req);
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message || message.length > 4096) return res.status(400).json({ ok: false });

      await sendTelegramMessage(telegramAllowedChatId.value().trim(), message);
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Client Telegram notification failed", error);
      return res.status(403).json({ ok: false });
    }
  }
);

exports.telegramWebhook = onRequest(
  {
    region: "asia-northeast3",
    invoker: "public",
    secrets: [telegramBotToken, telegramWebhookSecret, telegramAllowedChatId],
  },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (req.get("X-Telegram-Bot-Api-Secret-Token") !== telegramWebhookSecret.value().trim()) {
      return res.status(401).send("Unauthorized");
    }

    const message = req.body?.message;
    const chatId = String(message?.chat?.id || "");
    if (!message?.text || chatId !== telegramAllowedChatId.value().trim()) return res.status(200).send("ignored");

    // 그룹에서 `/todayleaves@봇사용자명` 또는 `/tomorrowleaves@봇사용자명` 형태도 허용합니다.
    if (/^\/todayleaves(?:@\w+)?$/i.test(message.text.trim())) {
      try {
        await sendTelegramMessage(chatId, await buildTodayLeavesMessage());
      } catch (error) {
        console.error("/todayleaves command failed", error);
        await sendTelegramMessage(chatId, "당일 연가자 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
    }

    if (/^\/tomorrowleaves(?:@\w+)?$/i.test(message.text.trim())) {
      try {
        await sendTelegramMessage(chatId, await buildTomorrowLeavesMessage());
      } catch (error) {
        console.error("/tomorrowleaves command failed", error);
        await sendTelegramMessage(chatId, "내일 연가자 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
    }

    return res.status(200).send("ok");
  }
);

async function sendConfiguredDailyLeaves({ requireExactTime = false } = {}) {
  const settingRef = db.collection("settings").doc("telegram_notification");
  const settingSnapshot = await settingRef.get();
  if (!settingSnapshot.exists) return { sent: false, reason: "missing-setting" };

  const setting = settingSnapshot.data();
  const now = getSeoulDateTime();
  if (!setting.enabled) return { sent: false, reason: "disabled" };
  if (requireExactTime && setting.dailyTime !== now.time) return { sent: false, reason: "not-scheduled-time" };

  const sendKey = `${now.date}_${setting.dailyTime || now.time}`;
  const shouldSend = await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(settingRef);
    const latestSetting = latest.exists ? latest.data() : null;
    if (!latestSetting || latestSetting.lastSentKey === sendKey) return false;
    transaction.set(settingRef, { lastSentKey: sendKey, lastSentAt: new Date().toISOString() }, { merge: true });
    return true;
  });

  if (!shouldSend) return { sent: false, reason: "already-sent" };

  try {
    const chatId = telegramAllowedChatId.value().trim();
    await sendTelegramMessage(chatId, await buildTodayLeavesMessage());
    await sendTelegramMessage(chatId, await buildTomorrowLeavesMessage());
    return { sent: true };
  } catch (error) {
    console.error("Scheduled daily Telegram notification failed", error);
    await settingRef.set({ lastSentKey: null }, { merge: true });
    throw error;
  }
}

// Migration fallback: this Firebase-managed job runs only once at midnight and never polls every minute.
// The dedicated app-managed scheduler job below performs the actual configured-time delivery.
exports.sendScheduledDailyLeaves = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Seoul",
    region: FUNCTIONS_REGION,
    secrets: [telegramBotToken, telegramAllowedChatId],
  },
  async () => sendConfiguredDailyLeaves({ requireExactTime: true })
);

exports.sendScheduledDailyLeavesV2 = onRequest(
  {
    region: FUNCTIONS_REGION,
    invoker: SCHEDULER_CALLER_SERVICE_ACCOUNT,
    secrets: [telegramBotToken, telegramAllowedChatId],
  },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ ok: false });
    try {
      const result = await sendConfiguredDailyLeaves();
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({ ok: false });
    }
  }
);
