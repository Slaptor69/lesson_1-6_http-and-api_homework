const API_URL = "http://localhost:3000/matches";
const REQUEST_TIMEOUT_MS = 10000;
const SEARCH_DELAY_MS = 400;
const collection = document.querySelector('[data-ui="collection"]');
const status = document.querySelector('[data-ui="status"]');
const statusTitle = status.querySelector(".status__title");
const statusText = status.querySelector(".status__text");
const reloadButton = document.querySelector('[data-action="reload"]');
const searchInput = document.querySelector("#match-search");
const clearSearchButton = document.querySelector('[data-action="clear-search"]');
const actionStatus = document.querySelector('[data-ui="action-status"]');
const form = document.querySelector('[data-form="entry"]');
const formFields = form.querySelector("fieldset");
const submitButton = form.querySelector('[data-action="submit"]');
const cancelEditButton = form.querySelector('[data-action="cancel-edit"]');
const formStatus = document.querySelector('[data-ui="form-status"]');
const formTitle = document.querySelector("#form-title");
const formKicker = document.querySelector('[data-ui="form-kicker"]');
const ronaldoTeamSelect = form.elements.namedItem("ronaldoTeam");
const opponentInput = form.elements.namedItem("opponent");
const ronaldoTeams = new Set([...ronaldoTeamSelect.options].map((option) => option.value).filter(Boolean));
const competitions = {
  "world-cup": "Чемпионат мира",
  "world-cup-qualifiers": "Отбор на чемпионат мира",
  "champions-league": "Лига чемпионов",
  "la-liga": "Ла Лига",
  other: "Другой турнир",
};
const dateFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" });

let matches = [];
let loading = false;
let submitting = false;
let deletingId = null;
let editingMatch = null;
let loadController = null;
let searchTimer = null;

function updateControls() {
  const busy = submitting || deletingId !== null;
  reloadButton.disabled = loading || busy;
  submitButton.disabled = loading || busy;
  formFields.disabled = busy;
  cancelEditButton.disabled = busy;
  cancelEditButton.hidden = editingMatch === null;
  searchInput.disabled = busy;
  clearSearchButton.disabled = busy || searchInput.value === "";
  form.setAttribute("aria-busy", String(submitting));
  submitButton.textContent = submitting ? "Сохраняем…" : editingMatch ? "Сохранить изменения" : "Сохранить матч";
  collection.querySelectorAll("button").forEach((button) => {
    button.disabled = loading || busy;
  });
}

function showState(state, count = 0, errorText = "") {
  const searching = searchInput.value.trim() !== "";
  const messages = {
    loading: ["Загрузка матчей", "Получаем коллекцию. Подождите немного."],
    success: ["Коллекция загружена", `Матчей в коллекции: ${count}.`],
    empty: searching ? ["Ничего не найдено", "Измените запрос или сбросьте поиск."] : ["Пока нет матчей", "Добавьте первый матч через форму."],
    error: ["Не удалось загрузить матчи", errorText],
  };
  status.className = `status status--${state}`;
  [statusTitle.textContent, statusText.textContent] = messages[state];
  collection.hidden = state !== "success";
  collection.setAttribute("aria-busy", String(state === "loading"));
  reloadButton.textContent = state === "error" ? "Повторить загрузку" : "Обновить";
}

function showMessage(element, state, text) {
  element.className = `status status--${state}`;
  element.textContent = text;
  element.hidden = false;
}

function errorMessage(error, writing = false) {
  if (error.name === "TimeoutError") {
    return writing
      ? "Время ожидания истекло (10 секунд). Обновите коллекцию перед повторной отправкой: сервер мог сохранить изменения."
      : "Время ожидания истекло (10 секунд). Попробуйте загрузить матчи ещё раз.";
  }
  if (error.name === "HttpError") {
    return `Сервер ответил ошибкой ${error.status}. Повторите действие после устранения ошибки.`;
  }
  return "Не удалось выполнить запрос. Проверьте подключение и запуск API, затем повторите действие.";
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const signal = options.signal;
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Ошибка HTTP: ${response.status}`);
      error.name = "HttpError";
      error.status = response.status;
      throw error;
    }
    if (options.method === "DELETE" || response.status === 204) return null;
    return await response.json();
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error("Истекло время ожидания запроса");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
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
  addDetail(details, "Команда Роналду", match.ronaldoTeam || "Не указана");
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
  const actions = document.createElement("div");
  actions.className = "card__actions";
  const editButton = document.createElement("button");
  editButton.className = "button button--secondary";
  editButton.type = "button";
  editButton.textContent = "Редактировать";
  editButton.addEventListener("click", () => startEditing(match));
  const deleteButton = document.createElement("button");
  deleteButton.className = "button button--danger";
  deleteButton.type = "button";
  deleteButton.textContent = "Удалить";
  const confirmation = document.createElement("div");
  confirmation.className = "card__confirmation";
  confirmation.hidden = true;
  const question = document.createElement("p");
  question.textContent = "Удалить этот матч из коллекции?";
  const confirmButton = document.createElement("button");
  confirmButton.className = "button button--danger";
  confirmButton.type = "button";
  confirmButton.textContent = "Да, удалить";
  confirmButton.addEventListener("click", () => deleteMatch(match));
  const cancelButton = document.createElement("button");
  cancelButton.className = "button button--secondary";
  cancelButton.type = "button";
  cancelButton.textContent = "Отмена";
  cancelButton.addEventListener("click", () => {
    confirmation.hidden = true;
    deleteButton.hidden = false;
  });
  deleteButton.addEventListener("click", () => {
    confirmation.hidden = false;
    deleteButton.hidden = true;
    confirmButton.focus();
  });
  const confirmActions = document.createElement("div");
  confirmActions.className = "card__actions";
  confirmActions.append(confirmButton, cancelButton);
  confirmation.append(question, confirmActions);
  actions.append(editButton, deleteButton);
  card.append(title, details, actions, confirmation);
  return card;
}

function collectionUrl() {
  const url = new URL(API_URL);
  const text = searchInput.value.trim();
  if (text) {
    url.searchParams.set("_where", JSON.stringify({
      or: ["homeTeam", "awayTeam", "note"].map((field) => ({ [field]: { contains: text } })),
    }));
  }
  return url;
}

async function loadMatches() {
  clearTimeout(searchTimer);
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  loading = true;
  matches = [];
  updateControls();
  showState("loading");
  collection.replaceChildren();
  try {
    const data = await request(collectionUrl(), { signal: controller.signal });
    if (loadController !== controller || controller.signal.aborted) return;
    if (!Array.isArray(data)) throw new Error("API вернул данные вместо массива матчей");
    matches = data;
    collection.replaceChildren(...matches.map(createMatchCard));
    showState(matches.length ? "success" : "empty", matches.length);
  } catch (error) {
    if (loadController !== controller || controller.signal.aborted || error.name === "AbortError") return;
    console.error("Не удалось загрузить матчи:", error);
    showState("error", 0, errorMessage(error));
  } finally {
    if (loadController === controller) {
      loadController = null;
      loading = false;
      updateControls();
    }
  }
}

function resetEditor() {
  editingMatch = null;
  form.reset();
  ronaldoTeamSelect.setCustomValidity("");
  opponentInput.setCustomValidity("");
  formTitle.textContent = "Добавить в коллекцию";
  formKicker.textContent = "Новый матч";
  formStatus.hidden = true;
  updateControls();
}

function startEditing(match) {
  if (submitting || deletingId !== null || loading) return;
  resetEditor();
  editingMatch = { ...match };
  for (const field of formFields.querySelectorAll("[name]")) field.value = match[field.name] ?? "";
  const away = match.ronaldoTeam === match.awayTeam;
  form.elements.namedItem("ronaldoSide").value = away ? "away" : "home";
  opponentInput.value = away ? match.homeTeam : match.awayTeam;
  formTitle.textContent = "Редактировать матч";
  formKicker.textContent = "Изменение записи";
  updateControls();
  ronaldoTeamSelect.focus();
}

function readMatchForm() {
  const data = new FormData(form);
  const team = data.get("ronaldoTeam");
  const opponent = data.get("opponent").trim();
  const home = data.get("ronaldoSide") === "home";
  return {
    ronaldoTeam: team,
    homeTeam: home ? team : opponent,
    awayTeam: home ? opponent : team,
    date: data.get("date"),
    competition: data.get("competition"),
    score: data.get("score").trim(),
    goals: Number(data.get("goals")),
    note: data.get("note").trim(),
    source: data.get("source").trim(),
  };
}

async function submitMatch(event) {
  event.preventDefault();
  if (submitting || loading || deletingId !== null) return;
  const match = readMatchForm();
  ronaldoTeamSelect.setCustomValidity(ronaldoTeams.has(match.ronaldoTeam) ? "" : "Выберите команду Роналду из списка.");
  const opponent = opponentInput.value.trim();
  let opponentError = "";
  if (opponent.length < 2) opponentError = "Введите название соперника: минимум 2 символа без пробелов по краям.";
  else if (opponent.toLocaleLowerCase("ru-RU") === match.ronaldoTeam.toLocaleLowerCase("ru-RU")) {
    opponentError = "Команда Роналду и соперник должны отличаться.";
  }
  opponentInput.setCustomValidity(opponentError);
  if (!form.reportValidity()) return;
  const editing = editingMatch !== null;
  const changes = editing
    ? Object.fromEntries(Object.entries(match).filter(([key, value]) => value !== editingMatch[key]))
    : match;
  if (editing && !Object.keys(changes).length) {
    resetEditor();
    showMessage(formStatus, "success", "Изменений нет.");
    return;
  }
  const url = editing ? `${API_URL}/${encodeURIComponent(editingMatch.id)}` : API_URL;
  submitting = true;
  updateControls();
  showMessage(formStatus, "loading", "Сохраняем матч. Подождите немного.");
  try {
    await request(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    resetEditor();
    showMessage(formStatus, "success", editing ? "Изменения сохранены." : "Матч сохранён в коллекцию.");
    searchInput.value = "";
    actionStatus.hidden = true;
    await loadMatches();
  } catch (error) {
    console.error("Не удалось сохранить матч:", error);
    showMessage(formStatus, "error", `${errorMessage(error, true)} Введённые данные остались в форме.`);
  } finally {
    submitting = false;
    updateControls();
  }
}

async function deleteMatch(match) {
  if (submitting || deletingId !== null || loading) return;
  deletingId = match.id;
  updateControls();
  showMessage(actionStatus, "loading", "Удаляем матч…");
  try {
    await request(`${API_URL}/${encodeURIComponent(match.id)}`, { method: "DELETE" });
    if (editingMatch?.id === match.id) resetEditor();
    await loadMatches();
    showMessage(actionStatus, "success", "Матч удалён.");
  } catch (error) {
    console.error("Не удалось удалить матч:", error);
    showMessage(actionStatus, "error", errorMessage(error, true));
  } finally {
    deletingId = null;
    updateControls();
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  loadController?.abort();
  loadController = null;
  loading = true;
  matches = [];
  collection.replaceChildren();
  actionStatus.hidden = true;
  showState("loading");
  updateControls();
  searchTimer = setTimeout(loadMatches, SEARCH_DELAY_MS);
});
clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  loadMatches();
});
form.addEventListener("input", (event) => {
  if (event.target.name === "ronaldoTeam" || event.target.name === "opponent") {
    ronaldoTeamSelect.setCustomValidity("");
    opponentInput.setCustomValidity("");
  }
  if (!submitting) formStatus.hidden = true;
});
cancelEditButton.addEventListener("click", resetEditor);
form.addEventListener("submit", submitMatch);
reloadButton.addEventListener("click", loadMatches);
loadMatches();
