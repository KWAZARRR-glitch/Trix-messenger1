/* =========================
   TRIX Messenger (FULL)
   - Auth (register/login) via API
   - Theme (dark/light)
   - Language (ru/en)
   - Rename username
   - Chats + messages
   - Netlify proxy support (API_BASE = "")
   - WAU v1: realtime via Socket.IO (online, typing, instant messages)
   - WAU v2: unread badges + browser notifications + smart scroll
   ========================= */

let currentUser = null;

let activeChatTarget = "TRIX Bot";
let activeChatId = null;

const chatLastTs = new Map(); // chatId -> last ts

// unread state (client-side)
const unread = new Map(); // targetUser -> count
const UNREAD_KEY = "trix_unread_v1";

// ----- DOM -----
const authUser = document.getElementById("authUser");
const authPass = document.getElementById("authPass");
const authPass2 = document.getElementById("authPass2");
const authBtn = document.getElementById("authBtn");
const switchAuth = document.getElementById("switchAuth");
const loginTitle = document.getElementById("loginTitle");

const loginScreen = document.getElementById("loginScreen");
const app = document.getElementById("app");

const profileName = document.getElementById("profileName");
const profileUsername = document.getElementById("profileUsername");

const menuBtn = document.getElementById("menuBtn");
const sideMenu = document.getElementById("sideMenu");

const openProfileBtn = document.getElementById("openProfile");
const openSettingsBtn = document.getElementById("openSettings");
const logoutBtn = document.getElementById("logoutBtn");

const profileModal = document.getElementById("profileModal");
const profileInfo = document.getElementById("profileInfo");

const settingsModal = document.getElementById("settingsModal");
const themeSelect = document.getElementById("themeSelect");
const langSelect = document.getElementById("langSelect");
const newUsernameInput = document.getElementById("newUsernameInput");
const changeUsernameBtn = document.getElementById("changeUsernameBtn");

// optional notify btn
const notifBtn = document.getElementById("notifBtn");

const settingsTitle = document.getElementById("settingsTitle");
const themeLabel = document.getElementById("themeLabel");
const langLabel = document.getElementById("langLabel");
const usernameLabel = document.getElementById("usernameLabel");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");

const profileTitle = document.getElementById("profileTitle");
const profileCloseBtn = document.getElementById("profileCloseBtn");

const chatList = document.getElementById("chatList");
const chatHeader = document.getElementById("chatHeader");
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const chatSearch = document.getElementById("chatSearch");

let isRegister = false;

// ================== CONFIG ==================

// API:
// - локально: http://localhost:3000
// - в проде на Netlify: "" (через /api и netlify.toml proxy)
const API_BASE = (location.hostname === "localhost")
  ? "http://localhost:3000"
  : "";

// SOCKET (WAU):
// - локально: http://localhost:3000
// - в проде: URL твоего Render сервера
const PROD_SOCKET_URL = "https://YOUR-RENDER.onrender.com"; // <-- ЗАМЕНИ НА СВОЙ Render URL
const SOCKET_URL = (location.hostname === "localhost")
  ? "http://localhost:3000"
  : PROD_SOCKET_URL;

// polling fallback
let pollTimer = null;

// Socket.IO runtime
let socket = null;
const online = new Set();
let typingTimer = null;

// ================== TOKEN ==================
function saveToken(token) { localStorage.setItem("trix_token", token); }
function getToken() { return localStorage.getItem("trix_token"); }
function clearToken() { localStorage.removeItem("trix_token"); }

// ================== API ==================
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
  return data;
}

async function doRegister(username, password) {
  await api("/api/register", { method: "POST", body: { username, password } });
}

async function doLogin(username, password) {
  const r = await api("/api/login", { method: "POST", body: { username, password } });
  saveToken(r.token);
  return r.username;
}

async function tryAutoLogin() {
  const token = getToken();
  if (!token) return null;
  try {
    const me = await api("/api/me");
    return me.username;
  } catch {
    clearToken();
    return null;
  }
}

async function userExists(username) {
  const r = await api("/api/users/exists?username=" + encodeURIComponent(username));
  return !!r.exists;
}

// ================== i18n ==================
const I18N = {
  ru: {
    loginTitleLogin: "Вход",
    loginTitleReg: "Регистрация",
    btnLogin: "Войти",
    btnReg: "Зарегистрироваться",
    switchToLogin: "Уже есть аккаунт? Войти",
    switchToReg: "Нет аккаунта? Зарегистрироваться",
    placeholderUser: "Имя пользователя",
    placeholderPass: "Пароль",
    placeholderPass2: "Повторите пароль",
    search: "Поиск",
    message: "Сообщение",
    profile: "Профиль",
    settings: "Настройки",
    logout: "Выйти",
    close: "Закрыть",
    theme: "Тема",
    dark: "Тёмная",
    light: "Светлая",
    language: "Язык",
    changeUsername: "Сменить username",
    usernameLabel: "Username",
    promptNewChat: "Введите username (например: alex)",
    errFill: "Заполните поля",
    errPassMismatch: "Пароли не совпадают",
    errBadCreds: "Неверные данные",
    errExists: "Пользователь уже существует",
    errUserNotFound: "Пользователь не найден: ",
    errSelf: "Нельзя написать самому себе 🙂",
    renamedOk: "Username изменён на @",
    errUsernameTaken: "Этот username уже занят",
    errBadUsername: "Неверный username (мин. 3 символа, без |)",
    typing: "печатает…",
    online: "online",
    notifAsk: "Включить уведомления",
    notifOn: "Уведомления включены",
    notifDenied: "Браузер запретил уведомления",
  },
  en: {
    loginTitleLogin: "Login",
    loginTitleReg: "Sign up",
    btnLogin: "Login",
    btnReg: "Create account",
    switchToLogin: "Already have an account? Login",
    switchToReg: "No account? Sign up",
    placeholderUser: "Username",
    placeholderPass: "Password",
    placeholderPass2: "Repeat password",
    search: "Search",
    message: "Message",
    profile: "Profile",
    settings: "Settings",
    logout: "Logout",
    close: "Close",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    language: "Language",
    changeUsername: "Change username",
    usernameLabel: "Username",
    promptNewChat: "Enter username (e.g. alex)",
    errFill: "Fill in the fields",
    errPassMismatch: "Passwords do not match",
    errBadCreds: "Wrong credentials",
    errExists: "User already exists",
    errUserNotFound: "User not found: ",
    errSelf: "You can't message yourself 🙂",
    renamedOk: "Username changed to @",
    errUsernameTaken: "This username is already taken",
    errBadUsername: "Invalid username (min 3 chars, no |)",
    typing: "typing…",
    online: "online",
    notifAsk: "Enable notifications",
    notifOn: "Notifications enabled",
    notifDenied: "Browser denied notifications",
  }
};

function getLang() {
  return localStorage.getItem("trix_lang") || "ru";
}

function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.ru[key] || key;
}

function applyLang(lang) {
  localStorage.setItem("trix_lang", lang);

  authUser.placeholder = t("placeholderUser");
  authPass.placeholder = t("placeholderPass");
  authPass2.placeholder = t("placeholderPass2");

  loginTitle.textContent = isRegister ? t("loginTitleReg") : t("loginTitleLogin");
  authBtn.textContent = isRegister ? t("btnReg") : t("btnLogin");
  switchAuth.textContent = isRegister ? t("switchToLogin") : t("switchToReg");

  chatSearch.placeholder = t("search");
  msgInput.placeholder = t("message");

  openProfileBtn.textContent = t("profile");
  openSettingsBtn.textContent = t("settings");
  logoutBtn.textContent = t("logout");

  profileTitle.textContent = t("profile");
  profileCloseBtn.textContent = t("close");

  settingsTitle.textContent = t("settings");
  themeLabel.textContent = t("theme");
  langLabel.textContent = t("language");
  usernameLabel.textContent = t("usernameLabel");
  changeUsernameBtn.textContent = t("changeUsername");
  settingsCloseBtn.textContent = t("close");

  themeSelect.options[0].textContent = t("dark");
  themeSelect.options[1].textContent = t("light");

  if (notifBtn) notifBtn.textContent = t("notifAsk");
}

function loadLang() {
  const lang = getLang();
  langSelect.value = lang;
  applyLang(lang);
}

// ================== THEME ==================
function applyTheme(theme) {
  document.body.classList.toggle("light", theme === "light");
  localStorage.setItem("trix_theme", theme);
  themeSelect.value = theme;
}

function loadTheme() {
  const theme = localStorage.getItem("trix_theme") || "dark";
  applyTheme(theme);
}

// ================== UNREAD STORAGE ==================
function unreadStorageKey() {
  return `${UNREAD_KEY}:${currentUser || "guest"}`;
}

function loadUnread() {
  unread.clear();
  try {
    const raw = localStorage.getItem(unreadStorageKey());
    const obj = raw ? JSON.parse(raw) : {};
    for (const [k, v] of Object.entries(obj)) {
      unread.set(k, Number(v) || 0);
    }
  } catch {}
}

function saveUnread() {
  const obj = {};
  for (const [k, v] of unread.entries()) obj[k] = v;
  localStorage.setItem(unreadStorageKey(), JSON.stringify(obj));
}

function incUnread(user) {
  if (!user) return;
  const n = (unread.get(user) || 0) + 1;
  unread.set(user, n);
  saveUnread();
  updateUnreadBadge(user);
  updateTitleBadge();
}

function clearUnread(user) {
  if (!user) return;
  unread.set(user, 0);
  saveUnread();
  updateUnreadBadge(user);
  updateTitleBadge();
}

function totalUnread() {
  let sum = 0;
  for (const v of unread.values()) sum += (Number(v) || 0);
  return sum;
}

function updateTitleBadge() {
  const n = totalUnread();
  document.title = n > 0 ? `(${n}) TRIX Messenger` : "TRIX Messenger";
}

function updateUnreadBadge(user) {
  const chatEl = [...chatList.querySelectorAll(".chat")].find((el) => el.dataset.chat === user);
  if (!chatEl) return;
  const badge = chatEl.querySelector(".unread-badge");
  const n = unread.get(user) || 0;

  if (badge) {
    badge.textContent = n > 99 ? "99+" : String(n);
  }
  chatEl.classList.toggle("has-unread", n > 0);
}

// ================== NOTIFICATIONS ==================
async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

function notifyNewMessage(from, text) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // не спамим, если вкладка активна и чат открыт
  if (document.visibilityState === "visible" && from === activeChatTarget) return;

  try {
    new Notification(`TRIX: ${from}`, {
      body: String(text || "").slice(0, 140),
    });
  } catch {}
}

if (notifBtn) {
  notifBtn.onclick = async () => {
    const ok = await ensureNotificationPermission();
    if (ok) alert(t("notifOn"));
    else alert(t("notifDenied"));
  };
}

// ================== HELPERS ==================
function showApp(username) {
  currentUser = username;
  loginScreen.style.display = "none";
  app.style.display = "flex";
  profileName.textContent = username;
  profileUsername.textContent = "@" + username;

  loadUnread();
  updateTitleBadge();
}

function showLogin() {
  currentUser = null;
  loginScreen.style.display = "flex";
  app.style.display = "none";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function chatIdFromUsers(a, b) {
  const arr = [a, b].sort();
  return `${arr[0]}|${arr[1]}`;
}

function otherUserFromChatId(chatId, me) {
  const parts = String(chatId).split("|");
  if (parts.length !== 2) return null;
  return parts[0] === me ? parts[1] : parts[1] === me ? parts[0] : null;
}

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function isAtBottom() {
  return messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 40;
}

function setActiveChat(targetUser) {
  activeChatTarget = targetUser;
  activeChatId = chatIdFromUsers(currentUser, targetUser);
  setHeaderBase();

  [...chatList.querySelectorAll(".chat")].forEach((el) => {
    el.classList.toggle("active", el.dataset.chat === targetUser);
  });

  // прочитали чат
  clearUnread(targetUser);

  refreshHeaderStatus();
}

function renderMessage(msg) {
  const mine = msg.sender === currentUser;
  const wrap = document.createElement("div");
  wrap.className = "msg " + (mine ? "me" : "them");

  const locale = getLang() === "ru" ? "ru-RU" : "en-US";
  const timeStr = new Date(msg.ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  wrap.innerHTML = `
    <div class="msg-bubble">
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="msg-time">${timeStr}</div>
    </div>
  `;
  return wrap;
}

// ================== CHATS/MESSAGES ==================
async function loadChatsAndRender() {
  let chats = [];
  try {
    const r = await api("/api/chats");
    chats = r.chats || [];
  } catch {
    chats = [];
  }

  const targets = [];
  for (const chatId of chats) {
    const other = otherUserFromChatId(chatId, currentUser);
    if (other) targets.push(other);
  }

  if (!targets.includes("TRIX Bot")) targets.unshift("TRIX Bot");

  chatList.innerHTML = "";
  for (const tUser of targets) {
    const div = document.createElement("div");
    div.className = "chat";
    div.dataset.chat = tUser;

    const badgeVal = unread.get(tUser) || 0;

    div.innerHTML = `
      <div class="chat-title">${escapeHtml(tUser)}</div>
      <div class="chat-last" id="last-${escapeHtml(tUser)}">—</div>
      <span class="unread-badge">${badgeVal > 99 ? "99+" : badgeVal}</span>
    `;

    div.classList.toggle("has-unread", (unread.get(tUser) || 0) > 0);

    div.onclick = async () => {
      setActiveChat(tUser);
      await loadFullActiveChatHistory();
    };

    chatList.appendChild(div);
  }

  if (!targets.includes(activeChatTarget)) activeChatTarget = targets[0] || "TRIX Bot";
  setActiveChat(activeChatTarget);
}

async function loadFullActiveChatHistory() {
  if (!activeChatId) return;

  const r = await api("/api/messages?chat=" + encodeURIComponent(activeChatId) + "&since=0");
  const list = r.messages || [];

  messagesEl.innerHTML = "";
  let lastTs = 0;

  for (const m of list) {
    messagesEl.appendChild(renderMessage(m));
    if ((m.ts || 0) > lastTs) lastTs = m.ts || 0;
  }

  chatLastTs.set(activeChatId, lastTs);

  const lastText = list.length ? list[list.length - 1].text : "—";
  const lastEl = document.getElementById("last-" + activeChatTarget);
  if (lastEl) lastEl.textContent = String(lastText).slice(0, 40);

  scrollMessagesToBottom();

  // чат прочитан
  clearUnread(activeChatTarget);
}

async function loadNewMessagesForActiveChat() {
  if (!activeChatId) return;

  const lastTs = chatLastTs.get(activeChatId) || 0;

  const r = await api(
    "/api/messages?chat=" +
    encodeURIComponent(activeChatId) +
    "&since=" +
    encodeURIComponent(String(lastTs))
  );

  const list = r.messages || [];
  if (!list.length) return;

  const atBottom = isAtBottom();

  let newLastTs = lastTs;
  for (const m of list) {
    messagesEl.appendChild(renderMessage(m));
    if ((m.ts || 0) > newLastTs) newLastTs = m.ts || 0;
  }
  chatLastTs.set(activeChatId, newLastTs);

  const lastMsg = list[list.length - 1];
  const lastEl = document.getElementById("last-" + activeChatTarget);
  if (lastEl) lastEl.textContent = String(lastMsg.text || "—").slice(0, 40);

  // WAU: если человек читает вверх — не срываем вниз
  if (atBottom) scrollMessagesToBottom();
}

// ================== SEND ==================
async function sendCurrentMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  msgInput.value = "";
  msgInput.focus();

  try {
    await api("/api/messages", { method: "POST", body: { to: activeChatTarget, text } });
    // если сокеты работают — сообщение придёт событием,
    // но как fallback подтянем новые
    await loadNewMessagesForActiveChat();
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("user_not_found")) return alert(t("errUserNotFound") + activeChatTarget);
    return alert("Error: " + msg);
  }
}

sendBtn.onclick = sendCurrentMessage;

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCurrentMessage();
  }
});

// ================== NEW CHAT ==================
chatSearch.addEventListener("dblclick", () => {
  startNewChat().catch((err) => alert("Error: " + err.message));
});

async function startNewChat() {
  let to = prompt(t("promptNewChat"));
  if (to == null) return;
  to = to.trim();
  if (!to) return;

  if (to === currentUser) return alert(t("errSelf"));

  const exists = await userExists(to);
  if (!exists) return alert(t("errUserNotFound") + to);

  const existing = [...chatList.querySelectorAll(".chat")].find((el) => el.dataset.chat === to);
  if (existing) {
    setActiveChat(to);
    await loadFullActiveChatHistory();
    return;
  }

  // создать чат блок
  const div = document.createElement("div");
  div.className = "chat";
  div.dataset.chat = to;
  div.innerHTML = `
    <div class="chat-title">${escapeHtml(to)}</div>
    <div class="chat-last" id="last-${escapeHtml(to)}">—</div>
    <span class="unread-badge">0</span>
  `;
  div.onclick = async () => {
    setActiveChat(to);
    await loadFullActiveChatHistory();
  };
  chatList.prepend(div);

  setActiveChat(to);
  messagesEl.innerHTML = "";
  chatLastTs.set(activeChatId, 0);
  scrollMessagesToBottom();
}

// search filter
chatSearch.addEventListener("input", () => {
  const q = chatSearch.value.trim().toLowerCase();
  [...chatList.querySelectorAll(".chat")].forEach((el) => {
    const u = (el.dataset.chat || "").toLowerCase();
    el.style.display = u.includes(q) ? "" : "none";
  });
});

// ================== POLLING FALLBACK ==================
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentUser || !activeChatId) return;
    try { await loadNewMessagesForActiveChat(); } catch {}
  }, 1500);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ================== MENU/PROFILE/SETTINGS ==================
menuBtn.onclick = () => sideMenu.classList.toggle("open");

openProfileBtn.onclick = () => {
  profileModal.style.display = "flex";
  profileInfo.textContent = `Имя: ${currentUser}\nUsername: @${currentUser}`;
  sideMenu.classList.remove("open");
};

openSettingsBtn.onclick = () => {
  settingsModal.style.display = "flex";
  sideMenu.classList.remove("open");
};

logoutBtn.onclick = () => {
  stopPolling();
  stopRealtime();
  clearToken();
  location.reload();
};

function closeProfile() {
  profileModal.style.display = "none";
}
function closeSettings() {
  settingsModal.style.display = "none";
}
window.closeProfile = closeProfile;
window.closeSettings = closeSettings;

// theme/lang handlers
themeSelect.onchange = () => applyTheme(themeSelect.value);
langSelect.onchange = () => applyLang(langSelect.value);

// rename username
async function changeUsername(newNameRaw) {
  let newName = String(newNameRaw || "").trim();
  if (newName.startsWith("@")) newName = newName.slice(1).trim();
  if (!newName) throw new Error("bad_username");

  const r = await api("/api/user/rename", {
    method: "POST",
    body: { newUsername: newName },
  });

  saveToken(r.token);
  currentUser = r.username;

  profileName.textContent = r.username;
  profileUsername.textContent = "@" + r.username;

  // unread state must be re-keyed
  loadUnread();
  updateTitleBadge();

  // realtime re-auth
  stopRealtime();
  startRealtime();

  // обновим активный чат/id и перезагрузим список/историю
  activeChatId = chatIdFromUsers(currentUser, activeChatTarget);
  chatLastTs.clear();
  await loadChatsAndRender();
  await loadFullActiveChatHistory();
}

changeUsernameBtn.onclick = async () => {
  const val = newUsernameInput.value.trim();
  if (!val) return alert(t("errBadUsername"));

  try {
    await changeUsername(val);
    newUsernameInput.value = "";
    closeSettings();
    alert(t("renamedOk") + currentUser);
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("username_taken")) return alert(t("errUsernameTaken"));
    if (msg.includes("bad_username")) return alert(t("errBadUsername"));
    if (msg.includes("same_username")) return alert("Это уже ваш username");
    return alert("Error: " + msg);
  }
};

// ================== AUTH UI ==================
switchAuth.onclick = () => {
  isRegister = !isRegister;
  authPass2.style.display = isRegister ? "block" : "none";

  loginTitle.textContent = isRegister ? t("loginTitleReg") : t("loginTitleLogin");
  authBtn.textContent = isRegister ? t("btnReg") : t("btnLogin");
  switchAuth.textContent = isRegister ? t("switchToLogin") : t("switchToReg");
};

authBtn.onclick = async () => {
  const u = authUser.value.trim();
  const p = authPass.value;

  if (!u || !p) return alert(t("errFill"));

  authBtn.disabled = true;

  try {
    if (isRegister) {
      if (p !== authPass2.value) return alert(t("errPassMismatch"));
      await doRegister(u, p);
      const username = await doLogin(u, p);
      showApp(username);
    } else {
      const username = await doLogin(u, p);
      showApp(username);
    }

    await loadChatsAndRender();
    await loadFullActiveChatHistory();

    startRealtime();
    startPolling();

  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("user_exists")) return alert(t("errExists"));
    if (msg.includes("bad_credentials")) return alert(t("errBadCreds"));
    if (msg.includes("password_too_short")) return alert("Password too short (min 4)");
    if (msg.includes("bad_username")) return alert(t("errBadUsername"));
    return alert("Error: " + msg);
  } finally {
    authBtn.disabled = false;
  }
};

// ================== HEADER STATUS (WAU) ==================
function setHeaderBase() {
  chatHeader.textContent = activeChatTarget || "";
}

function setHeaderStatus(statusText) {
  const base = activeChatTarget || "";
  chatHeader.textContent = statusText ? `${base} · ${statusText}` : base;
}

function refreshHeaderStatus() {
  if (!activeChatTarget) return;
  if (online.has(activeChatTarget)) setHeaderStatus(t("online"));
  else setHeaderStatus("");
}

// ================== SOCKET.IO REALTIME (WAU) ==================
function startRealtime() {
  if (!window.io) {
    console.warn("socket.io client not loaded. Realtime disabled.");
    return;
  }
  if (socket) return;

  if (location.hostname !== "localhost" && PROD_SOCKET_URL.includes("YOUR-RENDER")) {
    console.warn("Set PROD_SOCKET_URL in script.js to your Render URL for realtime.");
  }

  socket = window.io(SOCKET_URL, {
    transports: ["websocket"],
    auth: { token: getToken() },
  });

  socket.on("connect", () => {
    refreshHeaderStatus();
  });

  socket.on("disconnect", () => {
    setHeaderStatus("");
  });

  socket.on("message:new", async (msg) => {
    try {
      const other = otherUserFromChatId(msg.chat, currentUser);

      // last preview
      if (other) {
        const lastEl = document.getElementById("last-" + other);
        if (lastEl) lastEl.textContent = String(msg.text || "—").slice(0, 40);
      }

      // active chat -> render
      if (msg.chat === activeChatId) {
        messagesEl.appendChild(renderMessage(msg));
        chatLastTs.set(activeChatId, Math.max(chatLastTs.get(activeChatId) || 0, msg.ts || 0));

        // умный скролл: только если мы у низа
        if (isAtBottom()) scrollMessagesToBottom();
      } else {
        // если сообщение не в открытом чате — считаем непрочитанным
        if (other) {
          incUnread(other);
          notifyNewMessage(other, msg.text);
        }

        // если чата нет в списке — перезагрузим
        await loadChatsAndRender();
      }
    } catch {}
  });

  socket.on("presence", ({ username, online: isOnline }) => {
    if (!username) return;
    if (isOnline) online.add(username);
    else online.delete(username);

    if (username === activeChatTarget) {
      refreshHeaderStatus();
    }
  });

  socket.on("typing", ({ from, isTyping }) => {
    if (from !== activeChatTarget) return;
    if (isTyping) setHeaderStatus(t("typing"));
    else refreshHeaderStatus();
  });
}

function stopRealtime() {
  if (!socket) return;
  try { socket.disconnect(); } catch {}
  socket = null;
}

// typing emit
msgInput.addEventListener("input", () => {
  if (!socket || !activeChatTarget) return;

  socket.emit("typing", { to: activeChatTarget, isTyping: true });

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    if (socket) socket.emit("typing", { to: activeChatTarget, isTyping: false });
  }, 900);
});

// ================== INIT ==================
(async () => {
  showLogin();
  loadTheme();
  loadLang();

  const username = await tryAutoLogin();
  if (username) {
    showApp(username);
    await loadChatsAndRender();
    await loadFullActiveChatHistory();

    startRealtime();
    startPolling();
  }
})();