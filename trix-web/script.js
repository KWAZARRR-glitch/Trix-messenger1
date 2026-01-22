let currentUser = null;

let activeChatTarget = "TRIX Bot";
let activeChatId = null;
let pollTimer = null;

const chatLastTs = new Map(); // chatId -> last ts

// ---------- DOM ----------
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

const avatarMini = document.getElementById("avatarMini");
const avatarBig = document.getElementById("avatarBig");
const avatarFile = document.getElementById("avatarFile");
const avatarUploadText = document.getElementById("avatarUploadText");

const menuBtn = document.getElementById("menuBtn");
const sideMenu = document.getElementById("sideMenu");
const openProfileBtn = document.getElementById("openProfile");
const openSettingsBtn = document.getElementById("openSettings");
const logoutBtn = document.getElementById("logoutBtn");

const profileModal = document.getElementById("profileModal");
const profileInfoName = document.getElementById("profileInfoName");
const profileInfoUsername = document.getElementById("profileInfoUsername");

const settingsModal = document.getElementById("settingsModal");

// settings screens
const settingsScreenMain = document.getElementById("settingsScreenMain");
const settingsScreenTheme = document.getElementById("settingsScreenTheme");
const settingsScreenLang = document.getElementById("settingsScreenLang");
const settingsScreenUsername = document.getElementById("settingsScreenUsername");
const settingsScreenAbout = document.getElementById("settingsScreenAbout");

// settings nav
const goTheme = document.getElementById("goTheme");
const goLang = document.getElementById("goLang");
const goUsername = document.getElementById("goUsername");
const goAbout = document.getElementById("goAbout");

const backFromTheme = document.getElementById("backFromTheme");
const backFromLang = document.getElementById("backFromLang");
const backFromUsername = document.getElementById("backFromUsername");
const backFromAbout = document.getElementById("backFromAbout");

// theme radios
const setThemeDark = document.getElementById("setThemeDark");
const setThemeLight = document.getElementById("setThemeLight");
const dotDark = document.getElementById("dotDark");
const dotLight = document.getElementById("dotLight");

// lang radios
const setLangRu = document.getElementById("setLangRu");
const setLangEn = document.getElementById("setLangEn");
const dotRu = document.getElementById("dotRu");
const dotEn = document.getElementById("dotEn");

// username change
const newUsernameInput = document.getElementById("newUsernameInput");
const changeUsernameBtn = document.getElementById("changeUsernameBtn");

// about
const appVersion = document.getElementById("appVersion");
const buildInfo = document.getElementById("buildInfo");
const cacheInfo = document.getElementById("cacheInfo");

// list values
const themeValue = document.getElementById("themeValue");
const langValue = document.getElementById("langValue");
const usernameValue = document.getElementById("usernameValue");

// sidebar/chat
const chatList = document.getElementById("chatList");
const chatHeader = document.getElementById("chatHeader");
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const chatSearch = document.getElementById("chatSearch");
const newChatBtn = document.getElementById("newChatBtn");

// new chat modal
const newChatModal = document.getElementById("newChatModal");
const newChatUserInput = document.getElementById("newChatUserInput");
const createChatBtn = document.getElementById("createChatBtn");

// i18n texts
const menuProfileText = document.getElementById("menuProfileText");
const menuSettingsText = document.getElementById("menuSettingsText");
const menuLogoutText = document.getElementById("menuLogoutText");

const siThemeText = document.getElementById("siThemeText");
const siLangText = document.getElementById("siLangText");
const siUsernameText = document.getElementById("siUsernameText");
const siAboutText = document.getElementById("siAboutText");

const themeTitle = document.getElementById("themeTitle");
const themeDarkText = document.getElementById("themeDarkText");
const themeLightText = document.getElementById("themeLightText");

const langTitle = document.getElementById("langTitle");

const usernameTitle = document.getElementById("usernameTitle");
const usernameHint = document.getElementById("usernameHint");

const aboutTitle = document.getElementById("aboutTitle");

const newChatTitle = document.getElementById("newChatTitle");
const newChatHint = document.getElementById("newChatHint");

// ---------- state ----------
let isRegister = false;

// ---------- API ----------
const API_BASE = (location.hostname === "localhost")
  ? "http://localhost:3000"
  : "https://trix-server-ps8d.onrender.com"; // <-- ВСТАВЬ СВОЙ URL

function saveToken(token) { localStorage.setItem("trix_token", token); }
function getToken() { return localStorage.getItem("trix_token"); }
function clearToken() { localStorage.removeItem("trix_token"); }

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

// ---------- helpers ----------
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
function setActiveChat(targetUser) {
  activeChatTarget = targetUser;
  activeChatId = chatIdFromUsers(currentUser, targetUser);
  chatHeader.textContent = targetUser;

  [...chatList.querySelectorAll(".chat")].forEach((el) => {
    el.classList.toggle("active", el.dataset.chat === targetUser);
  });

  // for settings list
  usernameValue.textContent = "@" + currentUser;
}

// ---------- avatar (local only) ----------
function avatarKey() {
  return currentUser ? `trix_avatar_${currentUser}` : null;
}

function setAvatarFromDataUrl(dataUrl) {
  // mini
  avatarMini.textContent = "";
  avatarMini.innerHTML = `<img alt="avatar" src="${dataUrl}">`;
  // big
  avatarBig.textContent = "";
  avatarBig.innerHTML = `<img alt="avatar" src="${dataUrl}">`;
}

function setAvatarFallback() {
  const letter = (currentUser || "T").slice(0, 1).toUpperCase();
  avatarMini.innerHTML = "";
  avatarBig.innerHTML = "";
  avatarMini.textContent = letter;
  avatarBig.textContent = letter;
}

function loadAvatar() {
  if (!currentUser) return;
  const k = avatarKey();
  const dataUrl = localStorage.getItem(k);
  if (dataUrl) setAvatarFromDataUrl(dataUrl);
  else setAvatarFallback();
}

function saveAvatarDataUrl(dataUrl) {
  const k = avatarKey();
  if (!k) return;
  localStorage.setItem(k, dataUrl);
  setAvatarFromDataUrl(dataUrl);
}

// ---------- theme ----------
function getTheme() {
  return localStorage.getItem("trix_theme") || "dark";
}
function applyTheme(theme) {
  document.body.classList.toggle("light", theme === "light");

  // dots
  dotDark.classList.toggle("on", theme === "dark");
  dotLight.classList.toggle("on", theme === "light");

  localStorage.setItem("trix_theme", theme);
  themeValue.textContent = theme === "light" ? t("light") : t("dark");
}

// ---------- i18n ----------
const I18N = {
  ru: {
    login: "Вход",
    register: "Регистрация",
    btnLogin: "Войти",
    btnRegister: "Зарегистрироваться",
    switchToLogin: "Уже есть аккаунт? Войти",
    switchToRegister: "Нет аккаунта? Зарегистрироваться",
    userPlaceholder: "Имя пользователя",
    passPlaceholder: "Пароль",
    pass2Placeholder: "Повторите пароль",
    search: "Поиск",
    message: "Сообщение",
    profile: "Профиль",
    settings: "Настройки",
    logout: "Выйти",
    theme: "Тема",
    language: "Язык",
    username: "Username",
    about: "О приложении",
    dark: "Тёмная",
    light: "Светлая",
    usernameHint: "Можно сменить @username на новый",
    changeUsername: "Сменить username",
    uploadAvatar: "Загрузить аватар",
    newChat: "Новый чат",
    newChatHint: "Введите username пользователя",
    openChat: "Открыть чат",
    fillFields: "Заполните поля",
    passMismatch: "Пароли не совпадают",
    badCreds: "Неверные данные",
    userExists: "Пользователь уже существует",
    userNotFound: "Пользователь не найден: ",
    selfChat: "Нельзя написать самому себе 🙂",
    invalidUsername: "Неверный username (мин. 3 символа, без |)",
    usernameTaken: "Этот username уже занят",
    renamedOk: "Username изменён на @",
  },
  en: {
    login: "Login",
    register: "Sign up",
    btnLogin: "Login",
    btnRegister: "Create account",
    switchToLogin: "Already have an account? Login",
    switchToRegister: "No account? Sign up",
    userPlaceholder: "Username",
    passPlaceholder: "Password",
    pass2Placeholder: "Repeat password",
    search: "Search",
    message: "Message",
    profile: "Profile",
    settings: "Settings",
    logout: "Logout",
    theme: "Theme",
    language: "Language",
    username: "Username",
    about: "About",
    dark: "Dark",
    light: "Light",
    usernameHint: "You can change @username",
    changeUsername: "Change username",
    uploadAvatar: "Upload avatar",
    newChat: "New chat",
    newChatHint: "Enter user's username",
    openChat: "Open chat",
    fillFields: "Fill in the fields",
    passMismatch: "Passwords do not match",
    badCreds: "Wrong credentials",
    userExists: "User already exists",
    userNotFound: "User not found: ",
    selfChat: "You can't message yourself 🙂",
    invalidUsername: "Invalid username (min 3 chars, no |)",
    usernameTaken: "This username is already taken",
    renamedOk: "Username changed to @",
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

  // login UI
  loginTitle.textContent = isRegister ? t("register") : t("login");
  authBtn.textContent = isRegister ? t("btnRegister") : t("btnLogin");
  switchAuth.textContent = isRegister ? t("switchToLogin") : t("switchToRegister");
  authUser.placeholder = t("userPlaceholder");
  authPass.placeholder = t("passPlaceholder");
  authPass2.placeholder = t("pass2Placeholder");

  // app UI
  chatSearch.placeholder = t("search");
  msgInput.placeholder = t("message");

  // menu
  menuProfileText.textContent = t("profile");
  menuSettingsText.textContent = t("settings");
  menuLogoutText.textContent = t("logout");

  // settings list
  siThemeText.textContent = t("theme");
  siLangText.textContent = t("language");
  siUsernameText.textContent = t("username");
  siAboutText.textContent = t("about");

  themeTitle.textContent = t("theme");
  themeDarkText.textContent = t("dark");
  themeLightText.textContent = t("light");

  langTitle.textContent = t("language");
  usernameTitle.textContent = t("username");
  usernameHint.textContent = t("usernameHint");
  changeUsernameBtn.textContent = t("changeUsername");

  aboutTitle.textContent = t("about");

  newChatTitle.textContent = t("newChat");
  newChatHint.textContent = t("newChatHint");
  createChatBtn.textContent = t("openChat");

  avatarUploadText.textContent = t("uploadAvatar");

  // values
  themeValue.textContent = getTheme() === "light" ? t("light") : t("dark");
  langValue.textContent = getLang() === "en" ? "English" : "Русский";
  usernameValue.textContent = "@" + (currentUser || "username");
}

// ---------- UI show/hide ----------
function showApp(username) {
  currentUser = username;
  loginScreen.style.display = "none";
  app.style.display = "flex";
  profileName.textContent = username;
  profileUsername.textContent = "@" + username;
  usernameValue.textContent = "@" + username;

  profileInfoName.textContent = username;
  profileInfoUsername.textContent = "@" + username;

  loadAvatar();
  applyLang(getLang());
}

function showLogin() {
  currentUser = null;
  loginScreen.style.display = "flex";
  app.style.display = "none";
}

// ---------- Messages rendering ----------
function renderMessage(msg) {
  const mine = msg.sender === currentUser;
  const wrap = document.createElement("div");
  wrap.className = "msg " + (mine ? "me" : "them");

  wrap.innerHTML = `
    <div class="msg-bubble">
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="msg-time">${new Date(msg.ts).toLocaleTimeString(getLang()==="ru" ? "ru-RU" : "en-US", { hour:"2-digit", minute:"2-digit" })}</div>
    </div>
  `;
  return wrap;
}

// ---------- chats/messages ----------
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
  for (const u of targets) {
    const div = document.createElement("div");
    div.className = "chat";
    div.dataset.chat = u;
    div.innerHTML = `
      <div class="chat-title">${escapeHtml(u)}</div>
      <div class="chat-last" id="last-${escapeHtml(u)}">—</div>
    `;
    div.onclick = async () => {
      setActiveChat(u);
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
}

async function loadNewMessagesForActiveChat(scrollIfBottom = false) {
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

  const atBottom =
    messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 40;

  let newLastTs = lastTs;
  for (const m of list) {
    messagesEl.appendChild(renderMessage(m));
    if ((m.ts || 0) > newLastTs) newLastTs = m.ts || 0;
  }
  chatLastTs.set(activeChatId, newLastTs);

  const lastMsg = list[list.length - 1];
  const lastEl = document.getElementById("last-" + activeChatTarget);
  if (lastEl) lastEl.textContent = String(lastMsg.text || "—").slice(0, 40);

  if (scrollIfBottom || atBottom) scrollMessagesToBottom();
}

// ---------- sending ----------
async function sendCurrentMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  msgInput.value = "";
  msgInput.focus();

  try {
    await api("/api/messages", { method: "POST", body: { to: activeChatTarget, text } });
    await loadNewMessagesForActiveChat(true);
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("user_not_found")) return alert(t("userNotFound") + activeChatTarget);
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

// ---------- New chat (modal) ----------
newChatBtn.onclick = () => openNewChat();

function openNewChat() {
  newChatModal.style.display = "flex";
  newChatUserInput.value = "";
  newChatUserInput.focus();
}
function closeNewChat() {
  newChatModal.style.display = "none";
}
window.closeNewChat = closeNewChat;

async function startNewChat(usernameRaw) {
  let to = String(usernameRaw || "").trim();
  if (to.startsWith("@")) to = to.slice(1).trim();
  if (!to) return;

  if (to === currentUser) return alert(t("selfChat"));

  const exists = await userExists(to);
  if (!exists) return alert(t("userNotFound") + to);

  const existing = [...chatList.querySelectorAll(".chat")].find((el) => el.dataset.chat === to);
  if (existing) {
    setActiveChat(to);
    await loadFullActiveChatHistory();
    return;
  }

  const div = document.createElement("div");
  div.className = "chat";
  div.dataset.chat = to;
  div.innerHTML = `
    <div class="chat-title">${escapeHtml(to)}</div>
    <div class="chat-last" id="last-${escapeHtml(to)}">—</div>
  `;
  div.onclick = async () => {
    setActiveChat(to);
    await loadFullActiveChatHistory();
  };
  chatList.prepend(div);

  setActiveChat(to);
  messagesEl.innerHTML = "";
  chatLastTs.set(activeChatId, 0);
  chatHeader.textContent = to;
  scrollMessagesToBottom();
}

createChatBtn.onclick = async () => {
  try {
    await startNewChat(newChatUserInput.value);
    closeNewChat();
  } catch (e) {
    alert("Error: " + (e?.message || e));
  }
};
newChatUserInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") createChatBtn.click();
});

// search filter
chatSearch.addEventListener("input", () => {
  const q = chatSearch.value.trim().toLowerCase();
  [...chatList.querySelectorAll(".chat")].forEach((el) => {
    const u = (el.dataset.chat || "").toLowerCase();
    el.style.display = u.includes(q) ? "" : "none";
  });
});

// ---------- polling ----------
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentUser || !activeChatId) return;
    try { await loadNewMessagesForActiveChat(false); } catch {}
  }, 1000);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ---------- auth UI ----------
switchAuth.onclick = () => {
  isRegister = !isRegister;
  authPass2.style.display = isRegister ? "block" : "none";
  applyLang(getLang());
};

authBtn.onclick = async () => {
  const u = authUser.value.trim();
  const p = authPass.value;

  if (!u || !p) return alert(t("fillFields"));

  authBtn.disabled = true;
  try {
    if (isRegister) {
      if (p !== authPass2.value) return alert(t("passMismatch"));
      await doRegister(u, p);
      const username = await doLogin(u, p);
      showApp(username);
    } else {
      const username = await doLogin(u, p);
      showApp(username);
    }

    await loadChatsAndRender();
    await loadFullActiveChatHistory();
    startPolling();
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("user_exists")) return alert(t("userExists"));
    if (msg.includes("bad_credentials")) return alert(t("badCreds"));
    if (msg.includes("bad_username")) return alert(t("invalidUsername"));
    if (msg.includes("password_too_short")) return alert("Password too short (min 4)");
    return alert("Error: " + msg);
  } finally {
    authBtn.disabled = false;
  }
};

// ---------- menu/profile/settings ----------
menuBtn.onclick = () => sideMenu.classList.toggle("open");

openProfileBtn.onclick = () => {
  profileModal.style.display = "flex";
  profileInfoName.textContent = currentUser;
  profileInfoUsername.textContent = "@" + currentUser;
  sideMenu.classList.remove("open");
};

openSettingsBtn.onclick = () => {
  openSettingsMain();
  settingsModal.style.display = "flex";
  sideMenu.classList.remove("open");
};

logoutBtn.onclick = () => {
  stopPolling();
  clearToken();
  location.reload();
};

function closeProfile() { profileModal.style.display = "none"; }
function closeSettings() { settingsModal.style.display = "none"; openSettingsMain(); }
window.closeProfile = closeProfile;
window.closeSettings = closeSettings;

// ---------- settings navigation (telegram-like) ----------
function hideAllSettingsScreens() {
  settingsScreenMain.classList.add("hidden");
  settingsScreenTheme.classList.add("hidden");
  settingsScreenLang.classList.add("hidden");
  settingsScreenUsername.classList.add("hidden");
  settingsScreenAbout.classList.add("hidden");
}
function openSettingsMain() {
  hideAllSettingsScreens();
  settingsScreenMain.classList.remove("hidden");
}
function openSettingsTheme() {
  hideAllSettingsScreens();
  settingsScreenTheme.classList.remove("hidden");
}
function openSettingsLang() {
  hideAllSettingsScreens();
  settingsScreenLang.classList.remove("hidden");
}
function openSettingsUsername() {
  hideAllSettingsScreens();
  settingsScreenUsername.classList.remove("hidden");
  newUsernameInput.value = "@" + currentUser;
  newUsernameInput.focus();
}
function openSettingsAbout() {
  hideAllSettingsScreens();
  settingsScreenAbout.classList.remove("hidden");
}

goTheme.onclick = openSettingsTheme;
goLang.onclick = openSettingsLang;
goUsername.onclick = openSettingsUsername;
goAbout.onclick = openSettingsAbout;

backFromTheme.onclick = openSettingsMain;
backFromLang.onclick = openSettingsMain;
backFromUsername.onclick = openSettingsMain;
backFromAbout.onclick = openSettingsMain;

// ---------- theme actions ----------
setThemeDark.onclick = () => applyTheme("dark");
setThemeLight.onclick = () => applyTheme("light");

// ---------- language actions ----------
function setLang(lang) {
  localStorage.setItem("trix_lang", lang);
  dotRu.classList.toggle("on", lang === "ru");
  dotEn.classList.toggle("on", lang === "en");
  langValue.textContent = lang === "en" ? "English" : "Русский";
  applyLang(lang);
}
setLangRu.onclick = () => setLang("ru");
setLangEn.onclick = () => setLang("en");

// ---------- username change (server) ----------
async function changeUsername(newNameRaw) {
  let newName = String(newNameRaw || "").trim();
  if (newName.startsWith("@")) newName = newName.slice(1).trim();
  if (!newName) throw new Error("bad_username");

  const r = await api("/api/user/rename", {
    method: "POST",
    body: { newUsername: newName },
  });

  saveToken(r.token);

  // avatar migration (localStorage key changes!)
  const oldAvatarKey = `trix_avatar_${currentUser}`;
  const oldAvatar = localStorage.getItem(oldAvatarKey);

  currentUser = r.username;

  // move avatar if existed
  if (oldAvatar) {
    localStorage.removeItem(oldAvatarKey);
    localStorage.setItem(`trix_avatar_${currentUser}`, oldAvatar);
  }

  profileName.textContent = currentUser;
  profileUsername.textContent = "@" + currentUser;
  profileInfoName.textContent = currentUser;
  profileInfoUsername.textContent = "@" + currentUser;

  usernameValue.textContent = "@" + currentUser;
  loadAvatar();

  // chats need refresh because chatId changes include username
  activeChatId = chatIdFromUsers(currentUser, activeChatTarget);
  chatLastTs.clear();
  await loadChatsAndRender();
  await loadFullActiveChatHistory();
}

changeUsernameBtn.onclick = async () => {
  try {
    await changeUsername(newUsernameInput.value);
    alert(t("renamedOk") + currentUser);
    openSettingsMain();
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("username_taken")) return alert(t("usernameTaken"));
    if (msg.includes("bad_username")) return alert(t("invalidUsername"));
    if (msg.includes("same_username")) return alert("Это уже ваш username");
    return alert("Error: " + msg);
  }
};

// ---------- avatar upload ----------
avatarFile.addEventListener("change", async () => {
  const file = avatarFile.files && avatarFile.files[0];
  if (!file) return;

  // ограничим размер (чтобы localStorage не распух)
  if (file.size > 1024 * 1024 * 1.2) {
    alert("Файл слишком большой (макс ~1.2MB)");
    avatarFile.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!dataUrl.startsWith("data:image/")) {
      alert("Нужно изображение");
      return;
    }
    saveAvatarDataUrl(dataUrl);
  };
  reader.readAsDataURL(file);
});

// ---------- service worker register (cache/offline) ----------
async function registerSW() {
  try {
    if (!("serviceWorker" in navigator)) return;
    await navigator.serviceWorker.register("./sw.js");
    if (cacheInfo) cacheInfo.textContent = "включён";
  } catch {
    if (cacheInfo) cacheInfo.textContent = "выключен";
  }
}

// ---------- init ----------
(function initAbout() {
  if (appVersion) appVersion.textContent = "0.1";
  if (buildInfo) buildInfo.textContent = "local";
})();

(function initDots() {
  applyTheme(getTheme());
  setLang(getLang()); // also applies lang
})();

// ---------- profile modal close on esc ----------
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    profileModal.style.display = "none";
    settingsModal.style.display = "none";
    newChatModal.style.display = "none";
  }
});

// ---------- startup ----------
(async () => {
  showLogin();
  applyLang(getLang());
  applyTheme(getTheme());
  await registerSW();

  const username = await tryAutoLogin();
  if (username) {
    showApp(username);
    await loadChatsAndRender();
    await loadFullActiveChatHistory();
    startPolling();
  }
})();