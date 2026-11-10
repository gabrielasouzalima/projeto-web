// Estado do quadro e preferência visual.
const THEME_KEY = "kanban-board-theme";
const ACCOUNTS_KEY = "kanban-local-accounts-v1";
const SESSION_KEY = "kanban-local-session-v1";
const BOARD_KEY_PREFIX = "kanban-board-data-v1:";
const LEGACY_BOARD_KEY = "kanban-board-data-v1";
const PASSWORD_ITERATIONS = 310000;
const DEFAULT_COLUMNS = [
  { id: "todo", title: "A Fazer", color: "#6558d3" },
  { id: "doing", title: "Em Andamento", color: "#e5a331" },
  { id: "done", title: "Concluído", color: "#259b70" }
];

const state = {
  user: null,
  columns: [],
  cards: [],
  search: "",
  authMode: "login",
  draggedCardId: null
};

const elements = {
  authView: document.querySelector("#auth-view"),
  boardView: document.querySelector("#board-view"),
  authForm: document.querySelector("#auth-form"),
  authError: document.querySelector("#auth-error"),
  authName: document.querySelector("#auth-name"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authSubmit: document.querySelector("#auth-submit"),
  authTitle: document.querySelector("#auth-title"),
  authSubtitle: document.querySelector("#auth-subtitle"),
  authSwitchText: document.querySelector("#auth-switch-text"),
  authSwitchButton: document.querySelector("#auth-switch-button"),
  board: document.querySelector("#board"),
  dialog: document.querySelector("#card-dialog"),
  form: document.querySelector("#card-form"),
  status: document.querySelector("#status-message"),
  search: document.querySelector("#search-input"),
  importFile: document.querySelector("#import-file"),
  title: document.querySelector("#card-title"),
  description: document.querySelector("#card-description"),
  priority: document.querySelector("#card-priority"),
  cardId: document.querySelector("#card-id"),
  cardColumn: document.querySelector("#card-column"),
  dialogTitle: document.querySelector("#dialog-title")
};

let saveTimer = null;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function safeColumnColor(color) {
  return typeof color === "string" && /^#[\da-f]{6}$/i.test(color) ? color : "#6558d3";
}

function showStatus(message) {
  elements.status.textContent = message;
  if (message) window.setTimeout(() => {
    if (elements.status.textContent === message) elements.status.textContent = "";
  }, 5000);
}

function getAccounts() {
  const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  if (!Array.isArray(parsed)) throw new Error("Os cadastros locais estão corrompidos.");
  return parsed;
}

function bytesToHex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (!/^(?:[a-f\d]{2})+$/i.test(hex)) throw new Error("Cadastro local inválido.");
  return Uint8Array.from(hex.match(/.{2}/g), byte => parseInt(byte, 16));
}

async function hashPassword(password, saltHex) {
  if (!crypto.subtle) throw new Error("Seu navegador não oferece criptografia segura neste endereço. Abra o site em localhost ou HTTPS.");
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return { salt: bytesToHex(salt), hash: bytesToHex(new Uint8Array(bits)) };
}

function showAuth(message = "") {
  state.user = null;
  elements.boardView.hidden = true;
  elements.authView.hidden = false;
  setAuthMode("login");
  elements.authError.textContent = message;
  elements.authEmail.focus();
}

function showBoard(user) {
  state.user = user;
  elements.authView.hidden = true;
  elements.boardView.hidden = false;
  document.querySelector("#user-name").textContent = user.name
    ? `${user.name} · ${user.email}`
    : user.email;
  document.querySelector(".user-avatar").textContent = user.email.charAt(0).toLocaleUpperCase("pt-BR");
}

function defaultBoard() {
  return { columns: DEFAULT_COLUMNS.map(column => ({ ...column })), cards: [] };
}

function boardStorageKey(userId) {
  return `${BOARD_KEY_PREFIX}${userId}`;
}

function loadBoard() {
  try {
    const saved = JSON.parse(localStorage.getItem(boardStorageKey(state.user.id)));
    if (isValidImportedBoard(saved)) {
      state.columns = saved.columns.map(column => ({
        id: column.id,
        title: column.title,
        color: safeColumnColor(column.color)
      }));
      state.cards = saved.cards.map(card => ({
        id: card.id,
        columnId: card.columnId,
        title: card.title,
        description: card.description || "",
        priority: card.priority,
        createdAt: card.createdAt || new Date().toISOString()
      }));
      return;
    }
  } catch (error) {
    showStatus("Não foi possível ler os dados salvos neste navegador.");
    console.error("Erro ao carregar o quadro local:", error);
  }
  state.columns = defaultBoard().columns;
  state.cards = [];
}

function persistBoard() {
  try {
    if (!state.user) return;
    localStorage.setItem(boardStorageKey(state.user.id), JSON.stringify({
    columns: state.columns.map(column => ({ ...column })),
    cards: state.cards.map(card => ({ ...card }))
    }));
    showStatus("Alterações salvas neste navegador.");
  } catch (error) {
    showStatus("Não foi possível salvar. Verifique o espaço disponível no navegador.");
    console.error("Erro ao salvar o quadro local:", error);
  }
}

function scheduleBoardSave() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    persistBoard();
  }, 500);
}

function flushPendingSave() {
  if (!saveTimer) return;
  window.clearTimeout(saveTimer);
  saveTimer = null;
  persistBoard();
}

// Renderização: os dados do usuário são escapados antes de entrar no HTML.
function render() {
  const query = state.search.trim().toLocaleLowerCase("pt-BR");
  elements.board.innerHTML = state.columns.map(column => {
    const cards = state.cards.filter(card => card.columnId === column.id &&
      (!query || `${card.title} ${card.description}`.toLocaleLowerCase("pt-BR").includes(query)));
    const allCount = state.cards.filter(card => card.columnId === column.id).length;
    return `
      <section class="column" data-column-id="${escapeHTML(column.id)}" style="--column-color:${safeColumnColor(column.color)}" aria-label="Coluna ${escapeHTML(column.title)}">
        <header class="column-header">
          <span class="column-dot" aria-hidden="true"></span>
          <h2>${escapeHTML(column.title)}</h2>
          <span class="card-count" aria-label="${allCount} cartões">${allCount}</span>
          <details class="column-menu">
            <summary aria-label="Opções da coluna ${escapeHTML(column.title)}">•••</summary>
            <div class="column-menu-items">
              <button type="button" data-action="rename-column" data-column-id="${escapeHTML(column.id)}">Renomear</button>
              <button type="button" class="delete-column" data-action="delete-column" data-column-id="${escapeHTML(column.id)}">Excluir coluna</button>
            </div>
          </details>
        </header>
        <div class="card-list" data-dropzone="${escapeHTML(column.id)}">
          ${cards.map(renderCard).join("") || `<p class="empty-column">${query ? "Nenhum cartão encontrado." : "Solte cartões aqui"}</p>`}
        </div>
        <button class="add-card-button" type="button" data-action="add-card" data-column-id="${escapeHTML(column.id)}" aria-label="Adicionar cartão em ${escapeHTML(column.title)}"><span aria-hidden="true">＋</span> Adicionar cartão</button>
      </section>`;
  }).join("");
}

function renderCard(card) {
  const priorityNames = { baixa: "Baixa", media: "Média", alta: "Alta" };
  const date = new Date(card.createdAt);
  const created = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
  return `
    <article class="task-card" draggable="true" data-card-id="${escapeHTML(card.id)}" tabindex="0" aria-label="Cartão: ${escapeHTML(card.title)}">
      <span class="priority priority-${card.priority}">${priorityNames[card.priority]}</span>
      <h3>${escapeHTML(card.title)}</h3>
      ${card.description ? `<p class="task-card-description">${escapeHTML(card.description)}</p>` : ""}
      <footer class="card-footer">
        <time class="created-date" datetime="${escapeHTML(card.createdAt)}">Criado ${escapeHTML(created)}</time>
        <span class="card-actions">
          <button class="card-action" type="button" data-action="edit-card" data-card-id="${escapeHTML(card.id)}" aria-label="Editar ${escapeHTML(card.title)}" title="Editar">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"></path></svg>
          </button>
          <button class="card-action delete-card" type="button" data-action="delete-card" data-card-id="${escapeHTML(card.id)}" aria-label="Excluir ${escapeHTML(card.title)}" title="Excluir">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"></path></svg>
          </button>
        </span>
      </footer>
    </article>`;
}

// Autenticação demonstrativa: as contas existem apenas neste navegador.
function setAuthMode(mode) {
  state.authMode = mode;
  const registering = mode === "register";
  document.querySelector("#name-field").hidden = !registering;
  elements.authName.required = registering;
  elements.authPassword.autocomplete = registering ? "new-password" : "current-password";
  elements.authTitle.textContent = registering ? "Crie sua conta" : "Entre na sua conta";
  elements.authSubtitle.textContent = registering
    ? "Crie uma conta local para separar seus quadros neste navegador."
    : "Acesse seu quadro salvo neste dispositivo.";
  elements.authSubmit.textContent = registering ? "Criar conta" : "Entrar";
  elements.authSwitchText.textContent = registering ? "Já tem uma conta?" : "Ainda não tem uma conta?";
  elements.authSwitchButton.textContent = registering ? "Entrar" : "Criar conta";
  elements.authError.textContent = "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function migrateLegacyBoard(userId) {
  try {
    const legacy = localStorage.getItem(LEGACY_BOARD_KEY);
    if (legacy && !localStorage.getItem(boardStorageKey(userId))) {
      const parsed = JSON.parse(legacy);
      if (isValidImportedBoard(parsed)) {
        localStorage.setItem(boardStorageKey(userId), legacy);
        localStorage.removeItem(LEGACY_BOARD_KEY);
      }
    }
  } catch (error) {
    console.warn("Não foi possível migrar o quadro local existente:", error);
  }
}

async function submitAuth(event) {
  event.preventDefault();
  elements.authError.textContent = "";
  if (!elements.authForm.reportValidity()) return;

  const registering = state.authMode === "register";
  const email = elements.authEmail.value.trim().toLowerCase();
  const password = elements.authPassword.value;
  const label = registering ? "Criar conta" : "Entrar";
  elements.authSubmit.disabled = true;
  elements.authSubmit.textContent = "Aguarde...";

  try {
    if (!isValidEmail(email)) throw new Error("Informe um endereço de e-mail válido.");
    if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");

    const accounts = getAccounts();
    let account;
    if (registering) {
      const name = elements.authName.value.trim();
      if (name.length < 2) throw new Error("Informe um nome com pelo menos 2 caracteres.");
      if (accounts.some(item => item.email === email)) {
        throw new Error("Já existe uma conta local com este e-mail. Entre nela.");
      }
      const { salt, hash } = await hashPassword(password);
      account = { id: createId(), name, email, salt, passwordHash: hash };
      accounts.push(account);
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      migrateLegacyBoard(account.id);
    } else {
      account = accounts.find(item => item.email === email);
      if (!account) throw new Error("E-mail ou senha incorretos.");
      const { hash } = await hashPassword(password, account.salt);
      if (hash !== account.passwordHash) throw new Error("E-mail ou senha incorretos.");
    }

    localStorage.setItem(SESSION_KEY, account.id);
    elements.authForm.reset();
    state.user = account;
    loadBoard();
    render();
    showBoard(account);
  } catch (error) {
    elements.authError.textContent = error.message || "Não foi possível concluir o cadastro. Confira o espaço disponível neste navegador.";
    console.error("Erro no cadastro/login local:", error);
  } finally {
    elements.authSubmit.disabled = false;
    elements.authSubmit.textContent = label;
  }
}

function logout() {
  flushPendingSave();
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Não foi possível encerrar a sessão local:", error);
    showStatus("Não foi possível encerrar a sessão neste navegador.");
    return;
  }
  state.columns = [];
  state.cards = [];
  state.search = "";
  elements.search.value = "";
  render();
  showAuth();
}

// Edição do quadro.
function openCardDialog(columnId, card = null) {
  elements.form.reset();
  elements.cardId.value = card?.id ?? "";
  elements.cardColumn.value = card?.columnId ?? columnId;
  elements.title.value = card?.title ?? "";
  elements.description.value = card?.description ?? "";
  elements.priority.value = card?.priority ?? "media";
  elements.dialogTitle.textContent = card ? "Editar cartão" : "Novo cartão";
  elements.dialog.showModal();
  elements.title.focus();
}

function saveCard(event) {
  event.preventDefault();
  const title = elements.title.value.trim();
  if (!title) return elements.title.focus();
  const id = elements.cardId.value;
  const existing = state.cards.find(card => card.id === id);
  const card = {
    id: id || createId(),
    columnId: elements.cardColumn.value,
    title,
    description: elements.description.value.trim(),
    priority: elements.priority.value,
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };
  if (existing) Object.assign(existing, card);
  else state.cards.push(card);
  render();
  scheduleBoardSave();
  elements.dialog.close();
}

function addColumn() {
  const title = window.prompt("Nome da nova coluna:");
  if (title === null) return;
  if (!title.trim() || title.trim().length > 120) return showStatus("Use um nome de coluna entre 1 e 120 caracteres.");
  state.columns.push({ id: createId(), title: title.trim(), color: "#6558d3" });
  render();
  scheduleBoardSave();
}

function renameColumn(id) {
  const column = state.columns.find(item => item.id === id);
  if (!column) return;
  const title = window.prompt("Novo nome da coluna:", column.title);
  if (title === null) return;
  if (!title.trim() || title.trim().length > 120) return showStatus("Use um nome de coluna entre 1 e 120 caracteres.");
  column.title = title.trim();
  render();
  scheduleBoardSave();
}

function deleteColumn(id) {
  if (state.columns.length <= 1) return showStatus("O quadro precisa ter pelo menos uma coluna.");
  const column = state.columns.find(item => item.id === id);
  const count = state.cards.filter(card => card.columnId === id).length;
  if (!column || !window.confirm(`Excluir "${column.title}" e ${count} cartão(ões)?`)) return;
  state.columns = state.columns.filter(item => item.id !== id);
  state.cards = state.cards.filter(card => card.columnId !== id);
  render();
  scheduleBoardSave();
}

function exportBoard() {
  const blob = new Blob([JSON.stringify({ version: 1, columns: state.columns, cards: state.cards }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "meu-quadro-kanban.json";
  link.click();
  URL.revokeObjectURL(url);
  showStatus("Quadro exportado com sucesso.");
}

function isValidImportedBoard(board) {
  return board && Array.isArray(board.columns) && Array.isArray(board.cards) &&
    board.columns.length > 0 && board.columns.length <= 50 && board.cards.length <= 5000 &&
    board.columns.every(column => column && typeof column.id === "string" &&
      typeof column.title === "string" && column.title.trim() && column.title.length <= 120) &&
    board.cards.every(card => card && typeof card.id === "string" &&
      typeof card.columnId === "string" && typeof card.title === "string" &&
      card.title.trim() && card.title.length <= 120 &&
      (typeof card.description === "undefined" || typeof card.description === "string") &&
      ["baixa", "media", "alta"].includes(card.priority) &&
      board.columns.some(column => column.id === card.columnId));
}

function importBoard(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (!isValidImportedBoard(imported)) throw new Error("Formato ou conteúdo do quadro inválido.");
      if (!window.confirm("Importar substituirá os dados atuais do quadro. Deseja continuar?")) return;
      state.columns = imported.columns.map(column => ({
        id: column.id, title: column.title.trim(), color: safeColumnColor(column.color)
      }));
      state.cards = imported.cards.map(card => ({
        id: card.id, columnId: card.columnId, title: card.title.trim(),
        description: card.description || "", priority: card.priority,
        createdAt: typeof card.createdAt === "string" ? card.createdAt : new Date().toISOString()
      }));
      await persistBoard();
      render();
      showStatus("Quadro importado com sucesso.");
    } catch (error) {
      showStatus(`Não foi possível importar: ${error.message}`);
    } finally {
      elements.importFile.value = "";
    }
  };
  reader.onerror = () => showStatus("Não foi possível ler o arquivo selecionado.");
  reader.readAsText(file);
}

// Tema persistido localmente, sem guardar dados do quadro no navegador.
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("#theme-toggle").setAttribute("aria-label", theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); }
  catch (error) { console.error("Erro ao salvar a preferência de tema:", error); }
}

function handleBoardClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, columnId, cardId } = button.dataset;
  if (action === "add-card") openCardDialog(columnId);
  if (action === "edit-card") {
    const card = state.cards.find(item => item.id === cardId);
    if (card) openCardDialog(card.columnId, card);
  }
  if (action === "delete-card") {
    const card = state.cards.find(item => item.id === cardId);
    if (card && window.confirm(`Excluir o cartão "${card.title}"?`)) {
      state.cards = state.cards.filter(item => item.id !== cardId);
      render();
      scheduleBoardSave();
    }
  }
  if (action === "rename-column") renameColumn(columnId);
  if (action === "delete-column") deleteColumn(columnId);
}

function handleDragStart(event) {
  const card = event.target.closest(".task-card");
  if (!card) return;
  state.draggedCardId = card.dataset.cardId;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.draggedCardId);
}

function handleDragEnd(event) {
  event.target.closest(".task-card")?.classList.remove("dragging");
  document.querySelectorAll(".column.drag-over").forEach(column => column.classList.remove("drag-over"));
  state.draggedCardId = null;
}

function handleDrop(event) {
  const column = event.target.closest(".column");
  const list = event.target.closest(".card-list");
  if (!column || !list || !state.draggedCardId) return;
  event.preventDefault();
  const card = state.cards.find(item => item.id === state.draggedCardId);
  const targetColumnId = column.dataset.columnId;
  if (!card) return;
  const siblings = state.cards.filter(item => item.columnId === targetColumnId && item.id !== card.id);
  const afterElement = [...list.querySelectorAll(".task-card:not(.dragging)")].find(element => {
    const box = element.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });
  const nextIndex = afterElement ? siblings.findIndex(item => item.id === afterElement.dataset.cardId) : siblings.length;
  state.cards.splice(state.cards.indexOf(card), 1);
  card.columnId = targetColumnId;
  const targetPositions = state.cards.reduce((positions, item, index) => {
    if (item.columnId === targetColumnId) positions.push(index);
    return positions;
  }, []);
  const insertionIndex = nextIndex >= siblings.length || targetPositions[nextIndex] === undefined
    ? (targetPositions.length ? targetPositions[targetPositions.length - 1] + 1 : state.cards.length)
    : targetPositions[nextIndex];
  state.cards.splice(insertionIndex, 0, card);
  render();
  scheduleBoardSave();
}

function registerEvents() {
  elements.authForm.addEventListener("submit", submitAuth);
  elements.authSwitchButton.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "register" : "login");
  });
  document.querySelectorAll("[data-password-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const showing = input.type === "password";
      input.type = showing ? "text" : "password";
      button.textContent = showing ? "Ocultar" : "Mostrar";
      button.setAttribute("aria-label", showing ? "Ocultar senha" : "Mostrar senha");
    });
  });
  document.querySelector("#auth-theme-toggle").addEventListener("click", toggleTheme);
  elements.form.addEventListener("submit", saveCard);
  document.querySelector("#close-dialog-button").addEventListener("click", () => elements.dialog.close());
  document.querySelector("#cancel-dialog-button").addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", event => {
    if (event.target === elements.dialog) elements.dialog.close();
  });
  document.querySelector("#add-column-button").addEventListener("click", addColumn);
  document.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
  document.querySelector("#logout-button").addEventListener("click", logout);
  elements.search.addEventListener("input", () => { state.search = elements.search.value; render(); });
  document.querySelector("#export-button").addEventListener("click", exportBoard);
  document.querySelector("#import-button").addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", () => {
    if (elements.importFile.files?.[0]) importBoard(elements.importFile.files[0]);
  });
  elements.board.addEventListener("click", handleBoardClick);
  elements.board.addEventListener("dragstart", handleDragStart);
  elements.board.addEventListener("dragend", handleDragEnd);
  elements.board.addEventListener("dragover", event => {
    const column = event.target.closest(".column");
    if (!column || !state.draggedCardId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    column.classList.add("drag-over");
  });
  elements.board.addEventListener("dragleave", event => {
    const column = event.target.closest(".column");
    if (column && !column.contains(event.relatedTarget)) column.classList.remove("drag-over");
  });
  elements.board.addEventListener("drop", handleDrop);
  window.addEventListener("pagehide", flushPendingSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingSave();
  });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.search.focus();
    }
  });
}

function initialize() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  } catch (error) {
    applyTheme("light");
    console.error("Erro ao carregar o tema:", error);
  }
  registerEvents();
  try {
    const activeUserId = localStorage.getItem(SESSION_KEY);
    if (activeUserId) {
      state.user = getAccounts().find(account => account.id === activeUserId) || null;
      if (state.user) {
        loadBoard();
        render();
        showBoard(state.user);
        return;
      }
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    console.error("Não foi possível restaurar a sessão local:", error);
    showAuth("Não foi possível recuperar a conta local. Tente entrar novamente.");
    return;
  }
  render();
  showAuth();
}

initialize();
