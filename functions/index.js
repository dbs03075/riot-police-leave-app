const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const telegramAllowedChatId = defineSecret("TELEGRAM_ALLOWED_CHAT_ID");
const db = getFirestore();

const UNITS = ["1제대", "2제대", "3제대"];
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
    const names = people.map(({ name, detail }) => (detail ? `${name}[${detail}]` : name)).join(", ");
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

  return `📋 <b>[${unit}] ${dateDisplay} 연가자 현황</b>\n──────────────────\n${lines.join("\n")}\n──────────────────\n📊 연가 인원: ${leaveCount}/${capacity}명`;
}

async function buildTodayLeavesMessage() {
  const date = getSeoulDate();
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

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken.value().trim()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status}`);
}

async function getVerifiedAdmin(request) {
  const token = request.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("Missing authorization token");

  const { getAuth } = require("firebase-admin/auth");
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
  if (!employee || employee.data().role !== "admin") {
    throw new Error("Administrator permission required");
  }
  return decodedToken;
}

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

    // 그룹에서 `/todayleaves@봇사용자명` 형태로 들어오는 명령도 허용합니다.
    if (/^\/todayleaves(?:@\w+)?$/i.test(message.text.trim())) {
      try {
        await sendTelegramMessage(chatId, await buildTodayLeavesMessage());
      } catch (error) {
        console.error("/todayleaves command failed", error);
        await sendTelegramMessage(chatId, "당일 연가자 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
    }

    return res.status(200).send("ok");
  }
);

// Cloud Scheduler 작업 하나가 매분 설정을 확인합니다. 실제 텔레그램 전송은 하루 한 번뿐입니다.
exports.sendScheduledDailyLeaves = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: [telegramBotToken, telegramAllowedChatId],
  },
  async () => {
    const settingRef = db.collection("settings").doc("telegram_notification");
    const settingSnapshot = await settingRef.get();
    if (!settingSnapshot.exists) return;

    const setting = settingSnapshot.data();
    const now = getSeoulDateTime();
    if (!setting.enabled || setting.dailyTime !== now.time) return;

    const sendKey = `${now.date}_${now.time}`;
    const shouldSend = await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(settingRef);
      const latestSetting = latest.data();
      if (!latest.exists || latestSetting.lastSentKey === sendKey) return false;
      transaction.set(settingRef, { lastSentKey: sendKey, lastSentAt: new Date().toISOString() }, { merge: true });
      return true;
    });

    if (!shouldSend) return;

    try {
      await sendTelegramMessage(telegramAllowedChatId.value().trim(), await buildTodayLeavesMessage());
    } catch (error) {
      console.error("정기 당일 연가자 현황 전송 실패", error);
      await settingRef.set({ lastSentKey: null }, { merge: true });
      throw error;
    }
  }
);
