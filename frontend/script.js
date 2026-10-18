const API_URL = "http://localhost:3000/matches";
const collection = document.querySelector('[data-ui="collection"]');
const status = document.querySelector('[data-ui="status"]');
const statusTitle = status.querySelector(".status__title");
const statusText = status.querySelector(".status__text");
const reloadButton = document.querySelector('[data-action="reload"]');
const competitions = {
  "world-cup": "Чемпионат мира",
  "world-cup-qualifiers": "Отбор на чемпионат мира",
  "champions-league": "Лига чемпионов",
  "la-liga": "Ла Лига",
  other: "Другой турнир",
};
const dateFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" });

let loading = false;

function showState(state, count = 0) {
  const messages = {
    loading: ["Загрузка матчей", "Получаем коллекцию. Подождите немного."],
    success: ["Коллекция загружена", `Матчей в коллекции: ${count}.`],
    empty: ["Пока нет матчей", "Коллекция пуста. Попробуйте обновить её позже."],
    error: ["Не удалось загрузить матчи", "Проверьте подключение и запуск API, затем повторите загрузку."],
  };

  status.className = `status status--${state}`;
  [statusTitle.textContent, statusText.textContent] = messages[state];
  collection.hidden = state !== "success";
  collection.setAttribute("aria-busy", String(state === "loading"));
  reloadButton.disabled = state === "loading";
  reloadButton.textContent = state === "error" ? "Повторить загрузку" : "Обновить";
}

function addDetail(details, label, value) {
  const row = document.createElement("div");
  row.className = "card__row";
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  row.append(term, description);
  details.append(row);
  return description;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

function createMatchCard(match) {
  const card = document.createElement("article");
  card.className = "card";
  const title = document.createElement("h3");
  title.className = "card__title";
  title.textContent = `${match.homeTeam} — ${match.awayTeam}`;
  const details = document.createElement("dl");
  details.className = "card__meta";
  addDetail(details, "Дата", formatDate(match.date));
  addDetail(details, "Турнир", competitions[match.competition] ?? match.competition);
  addDetail(details, "Счёт", match.score);
  addDetail(details, "Голы Роналду", match.goals);
  addDetail(details, "О матче", match.note || "Без заметки");
  const source = addDetail(details, "Источник", "Не указан");

  try {
    const url = new URL(match.source);
    if (url.protocol === "https:" || url.protocol === "http:") {
      const link = document.createElement("a");
      link.className = "card__source";
      link.href = url.href;
      link.textContent = "Отчёт о матче";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      source.replaceChildren(link);
    }
  } catch {
    // Пустая или некорректная ссылка остаётся текстом «Не указан».
  }

  card.append(title, details);
  return card;
}

function renderMatches(matches) {
  collection.replaceChildren(...matches.map(createMatchCard));
}

async function fetchMatches() {
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
  const matches = await response.json();
  if (!Array.isArray(matches)) throw new Error("API вернул данные вместо массива матчей");
  return matches;
}

async function loadMatches() {
  if (loading) return;
  loading = true;
  showState("loading");
  collection.replaceChildren();

  try {
    const matches = await fetchMatches();
    renderMatches(matches);
    showState(matches.length ? "success" : "empty", matches.length);
  } catch (error) {
    console.error("Не удалось загрузить матчи:", error);
    showState("error");
  } finally {
    loading = false;
  }
}

reloadButton.addEventListener("click", loadMatches);
loadMatches();

