// =================== Імпорти ===================
import 'dotenv/config';
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";

import { fetchPracujJobs } from "./scrapers/pracuj_pl.js";
import { fetchPracaJobs } from "./scrapers/praca_pl.js";
import { fetchOlxJobs } from "./scrapers/olx_pl.js";

// =================== Ініціалізація ===================
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("❌ Telegram Bot Token not provided!");
const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Бот запущено!");

// =================== Файли ===================
const USERS_FILE = "./users.json";
const SEEN_FILE = "./seenOffers.json";
const COUNTERS_FILE = "./jobCounters.json";

let users = loadJson(USERS_FILE, []);
let seenOffers = loadJson(SEEN_FILE, {});
let jobCounters = loadJson(COUNTERS_FILE, {});

function loadJson(path, def) {
  if (!fs.existsSync(path)) return def;
  try {
    const raw = fs.readFileSync(path, "utf8");
    if (!raw) return def;
    return JSON.parse(raw);
  } catch {
    return def;
  }
}

function saveJson(path, data) {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`❌ Помилка запису ${path}:`, err.message);
  }
}

// =================== Глобальні змінні ===================
const userStates = {}; // { chatId: { step } }
const tempJobs = {};   // { chatId: { keyword: { jobs, timeout } } }

// =================== Допоміжні ===================
async function fetchJobsByKeyword(keyword) {
  const cleanKeyword = (keyword || "").trim();
  const [pracuj, praca, olx] = await Promise.all([
    fetchPracujJobs(cleanKeyword),
    fetchPracaJobs(cleanKeyword),
    fetchOlxJobs(cleanKeyword),
  ]);
  return [...(pracuj || []), ...(praca || []), ...(olx || [])];
}

function addSeenLinks(store, chatId, keyword, links) {
  if (!store[chatId]) store[chatId] = {};
  if (!store[chatId][keyword]) store[chatId][keyword] = [];
  links.forEach(l => {
    if (!store[chatId][keyword].includes(l)) store[chatId][keyword].push(l);
  });
}

function getUserKeywordLinks(store, chatId, keyword) {
  return store[chatId]?.[keyword] || [];
}

function escapeHtml(text) {
  if (typeof text !== "string") return "";
  return text.replaceAll("&", "&amp;")
             .replaceAll("<", "&lt;")
             .replaceAll(">", "&gt;")
             .replaceAll('"', "&quot;");
}

function safeHref(url) {
  if (!url || typeof url !== "string") return "";
  try {
    return encodeURI(url.trim().replaceAll('"', "%22"));
  } catch {
    return encodeURI(String(url).trim().replaceAll('"', "%22"));
  }
}

// =================== Меню ===================
function showStartButton(chatId) {
  bot.sendMessage(chatId, "Натисніть кнопку, щоб почати роботу:", {
    reply_markup: { inline_keyboard: [[{ text: "▶️ Почати", callback_data: "start_menu" }]] }
  }).catch(console.error);
}

function showMainMenu(chatId) {
  bot.sendMessage(chatId, "📌 Виберіть дію:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Знайти вакансію", callback_data: "find_job" }],
        [{ text: "📄 Мої підписки", callback_data: "my_keywords" }],
        [{ text: "❌ Вийти", callback_data: "exit" }]
      ]
    }
  }).catch(console.error);
}

// =================== Відправка вакансій ===================
async function sendJobsBatch(chatId, jobs, keyword, isTemp = false) {
  const BATCH_SIZE = 3;
  if (!Array.isArray(jobs) || jobs.length === 0) return;

  if (!isTemp) {
    if (!jobCounters[chatId]) jobCounters[chatId] = {};
    if (!jobCounters[chatId][keyword]) jobCounters[chatId][keyword] = 0;
  }

  let tempCounter = 0;
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const parts = batch.map(job => {
      const number = isTemp ? ++tempCounter : ++jobCounters[chatId][keyword];
      const marker = number % 2 === 0 ? "🟢" : "🔵";
      const title = escapeHtml(job.title || "Без назви");
      const company = escapeHtml(job.company || "Не вказано");
      const location = escapeHtml(job.location || "Не вказано");
      const salary = escapeHtml(job.salary || "Не вказано");
      const published = escapeHtml(job.published || "Не вказано");
      const href = safeHref(job.offerLink || "");
      const linkPart = href ? `<a href="${href}">Перейти на сторінку оголошення</a>` : "Посилання відсутнє";
      return `${marker} <b>${number}. ${title}</b>\n🏢 ${company}\n📍 ${location}\n💰 ${salary}\n🕒 ${published}\n🔗 ${linkPart}`;
    });

    let currentText = "";
    for (const p of parts) {
      if ((currentText.length + p.length + 2) > 3800) {
        try { await bot.sendMessage(chatId, currentText, { parse_mode: "HTML" }); await new Promise(r => setTimeout(r, 600)); } catch {}
        currentText = p;
      } else {
        currentText = currentText ? `${currentText}\n\n${p}` : p;
      }
    }
    if (currentText) try { await bot.sendMessage(chatId, currentText, { parse_mode: "HTML" }); await new Promise(r => setTimeout(r, 600)); } catch {}
  }

  if (!isTemp) saveJson(COUNTERS_FILE, jobCounters);
}

// =================== Обробка команд ===================
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || "користувач";
  bot.sendMessage(chatId, `👋 Вітаю, ${escapeHtml(firstName)}!`, { parse_mode: "HTML" });
  showStartButton(chatId);
});

bot.on("callback_query", async query => {
  if (!query?.message) return;
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "start_menu") return showMainMenu(chatId);
  if (data === "find_job") {
    bot.sendMessage(chatId, "✍️ Введіть назву вакансії:");
    userStates[chatId] = { step: "waiting_keyword" };
    return;
  }
  if (data === "exit") return showStartButton(chatId);

  if (data === "my_keywords") {
    const user = users.find(u => u.chatId === chatId);
    if (!user?.keywords?.length) {
      return bot.sendMessage(chatId, "ℹ️ У вас немає підписок", { reply_markup: { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "start_menu" }]] } });
    }
    const buttons = user.keywords.map(k => [{ text: `❌ Відписатись ${k}`, callback_data: `unsubscribe_${k}` }]);
    buttons.push([{ text: "🔙 Назад", callback_data: "start_menu" }]);
    return bot.sendMessage(chatId, "Ваші підписки:", { reply_markup: { inline_keyboard: buttons } });
  }

 // --- Підписка ---
if (data.startsWith("subscribe_keyword_")) {
  const keyword = data.replace("subscribe_keyword_", "").trim();
  let user = users.find(u => u.chatId === chatId);
  if (!user) { 
    user = { chatId, keywords: [] }; 
    users.push(user); 
  }

  // Спершу перевірка, чи вже підписаний
  if (user.keywords.includes(keyword)) {
    return bot.sendMessage(chatId, `ℹ️ Ви вже підписані на "${escapeHtml(keyword)}"`, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Назад", callback_data: "start_menu" }]
        ]
      }
    });
  }

  // Потім перевірка часу дії тимчасових результатів
  if (!tempJobs[chatId]?.[keyword]) {
    return bot.sendMessage(chatId, 
      `⏰ Час для підписки на "${escapeHtml(keyword)}" вичерпався. Повторіть пошук!`, 
      { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Знайти вакансію", callback_data: "find_job" }],
            [{ text: "🔙 Назад", callback_data: "start_menu" }]
          ]
        }
      }
    );
  }

  // Реєстрація підписки
  user.keywords.push(keyword);
  const jobs = tempJobs[chatId][keyword].jobs || [];
  addSeenLinks(seenOffers, chatId, keyword, jobs.map(j => j.offerLink));
  if (!jobCounters[chatId]) jobCounters[chatId] = {};
  jobCounters[chatId][keyword] = jobs.length;
  clearTimeout(tempJobs[chatId][keyword].timeout);
  delete tempJobs[chatId][keyword];

  saveJson(USERS_FILE, users);
  saveJson(SEEN_FILE, seenOffers);
  saveJson(COUNTERS_FILE, jobCounters);

  return bot.sendMessage(chatId, `✅ Ви підписались на "${escapeHtml(keyword)}"`, { 
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Назад", callback_data: "start_menu" }]
      ]
    }
  });
}


  // --- Відписка ---
  if (data.startsWith("unsubscribe_")) {
    const keyword = data.replace("unsubscribe_", "").trim();
    const user = users.find(u => u.chatId === chatId);
    if (user) {
      user.keywords = user.keywords.filter(k => k !== keyword);
      if (!user.keywords.length) users = users.filter(u => u.chatId !== chatId);
      delete seenOffers[chatId]?.[keyword];
      delete jobCounters[chatId]?.[keyword];

      saveJson(USERS_FILE, users);
      saveJson(SEEN_FILE, seenOffers);
      saveJson(COUNTERS_FILE, jobCounters);

      return bot.sendMessage(chatId, `❌ Ви відписались від "${escapeHtml(keyword)}"`, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Назад", callback_data: "start_menu" }]
        ]
      } 
      });
    }
  }
});

// =================== Обробка повідомлень ===================
bot.on("message", async msg => {
  if (!msg?.text || msg.text.startsWith("/")) return;
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  if (!state) return;

  if (state.step === "waiting_keyword") {
    const keyword = msg.text.trim();
    userStates[chatId] = { step: "idle" };
    await bot.sendMessage(chatId, `🔍 Шукаю вакансії  "${escapeHtml(keyword)}"...`, { parse_mode: "HTML" });

    const jobs = await fetchJobsByKeyword(keyword);
    if (!jobs.length) return bot.sendMessage(chatId, `ℹ️ Нових вакансій за "${escapeHtml(keyword)}" немає`, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Назад", callback_data: "start_menu" }]
        ]
      } 
      });

    const user = users.find(u => u.chatId === chatId);
    if (user?.keywords.includes(keyword)) {
      const seenLinks = getUserKeywordLinks(seenOffers, chatId, keyword);
      const newJobs = jobs.filter(j => !seenLinks.includes(j.offerLink));
      if (!newJobs.length) return bot.sendMessage(chatId, `ℹ️ Нових вакансій для "${escapeHtml(keyword)}" немає`, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Назад", callback_data: "start_menu" }]
        ]
      } 
      });

      await sendJobsBatch(chatId, newJobs, keyword, false);
      addSeenLinks(seenOffers, chatId, keyword, newJobs.map(j => j.offerLink));
      saveJson(SEEN_FILE, seenOffers);
      return bot.sendMessage(chatId, `🔔 Оновлення для "${escapeHtml(keyword)}"`, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: `❌ Відписатись від "${keyword}"`, callback_data: `unsubscribe_${keyword}` }], [{ text: "🔍 Знайти вакансію", callback_data: "find_job" }], [{ text: "🔙 Назад", callback_data: "start_menu" }]] }
      });
    }

    // --- тимчасовий пошук ---
    if (!tempJobs[chatId]) tempJobs[chatId] = {};
    if (tempJobs[chatId][keyword]) clearTimeout(tempJobs[chatId][keyword].timeout);
    tempJobs[chatId][keyword] = {
      jobs,
      timeout: setTimeout(() => delete tempJobs[chatId][keyword], 30 * 60 * 1000)
    };

    await sendJobsBatch(chatId, jobs, keyword, true);

    return bot.sendMessage(chatId, "Підпишіться на оновлення!", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: `🔔 Підписатись на "${keyword}"`, callback_data: `subscribe_keyword_${keyword}` }], [{ text: "🔙 Назад", callback_data: "start_menu" }]] }
    });
  }
});

// =================== Плановий запуск ===================
async function scheduledFetch() {
  if (!users.length) return;
  for (const user of [...users]) {
    if (!user?.chatId || !user.keywords?.length) continue;
    for (const keyword of [...user.keywords]) {
      try {
        const jobs = await fetchJobsByKeyword(keyword);
        const seenLinks = getUserKeywordLinks(seenOffers, user.chatId, keyword);
        const newJobs = (jobs || []).filter(j => !seenLinks.includes(j.offerLink));
        if (!newJobs.length) continue;

        await sendJobsBatch(user.chatId, newJobs, keyword, false);
        addSeenLinks(seenOffers, user.chatId, keyword, newJobs.map(j => j.offerLink));
        saveJson(SEEN_FILE, seenOffers);

        await bot.sendMessage(user.chatId, `🔔 Нові вакансії для "${escapeHtml(keyword)}"`, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: `❌ Відписатись від "${keyword}"`, callback_data: `unsubscribe_${keyword}` }], [{ text: "🔍 Знайти вакансію", callback_data: "find_job" }], [{ text: "🔙 Назад", callback_data: "start_menu" }]] }
        });
      } catch {}
    }
  }
}

scheduledFetch();
setInterval(scheduledFetch, 60 * 60 * 1000);
