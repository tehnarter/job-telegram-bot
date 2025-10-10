//utils/storage.js

import fs from "fs";

const FILE = "seenOffers.json";

// Завантаження seenOffers
export function loadSeenOffers() {
  try {
    const data = fs.readFileSync(FILE, "utf-8");
    return JSON.parse(data); // { chatId: { keyword: [links] } }
  } catch {
    return {};
  }
}

// Збереження seenOffers
export function saveSeenOffers(seenOffers) {
  fs.writeFileSync(FILE, JSON.stringify(seenOffers, null, 2));
}

// Отримати масив посилань конкретного користувача по ключовому слову
export function getUserKeywordLinks(seenOffers, chatId, keyword) {
  if (!seenOffers[chatId]) seenOffers[chatId] = {};
  if (!seenOffers[chatId][keyword]) seenOffers[chatId][keyword] = [];
  return seenOffers[chatId][keyword];
}

// Додати нові посилання в пам'ять користувача
export function addSeenLinks(seenOffers, chatId, keyword, links) {
  const userLinks = getUserKeywordLinks(seenOffers, chatId, keyword);
  links.forEach(link => {
    if (!userLinks.includes(link)) userLinks.push(link);
  });
}

// Видалити ключове слово та всі посилання користувача
export function removeKeyword(seenOffers, chatId, keyword) {
  if (seenOffers[chatId] && seenOffers[chatId][keyword]) {
    delete seenOffers[chatId][keyword];
  }
}
