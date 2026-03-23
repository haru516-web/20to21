const STORAGE_KEY = "night_threads_data_v1";
const MAX_THREADS = 10;
const CLOSE_HOUR = 14;
const CLOSE_MINUTE = 36;
const FORCE_OPEN = true;

function getTokyoTime(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    minute: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(now);
  const map = {};

  parts.forEach(part => {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  });

  return {
    hour: Number(map.hour),
    minute: Number(map.minute)
  };
}

function isAfterCloseTime(now = new Date()) {
  const tokyoTime = getTokyoTime(now);
  const currentMinutes = tokyoTime.hour * 60 + tokyoTime.minute;
  const closeMinutes = CLOSE_HOUR * 60 + CLOSE_MINUTE;
  return currentMinutes >= closeMinutes;
}

function enforceClosingRedirect() {
  if (FORCE_OPEN) {
    return;
  }

  const redirectToIndex = () => {
    alert("This room is closed.");
    window.location.href = "index.html";
  };

  if (isAfterCloseTime()) {
    redirectToIndex();
    return;
  }

  setInterval(() => {
    if (isAfterCloseTime()) {
      redirectToIndex();
    }
  }, 1000);
}

function createEmptyThread() {
  return {
    id: generateId(),
    theme: "",
    link: "",
    messages: [],
    createdAt: null
  };
}

function loadThreads() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = [createEmptyThread()];
    saveThreads(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [createEmptyThread()];
  } catch (error) {
    const fallback = [createEmptyThread()];
    saveThreads(fallback);
    return fallback;
  }
}

function saveThreads(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function generateId() {
  return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeLink(link) {
  if (!link.trim()) return "";
  if (/^https?:\/\//i.test(link)) return link.trim();
  return "https://" + link.trim();
}

function formatTime(dateString) {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

function ensureThreadSlots(threads) {
  const activeThreads = threads
    .filter(thread => thread.theme.trim() !== "")
    .slice(0, MAX_THREADS);
  const emptyThread = threads.find(thread => thread.theme.trim() === "");

  if (activeThreads.length < MAX_THREADS) {
    activeThreads.push(emptyThread || createEmptyThread());
  }

  return activeThreads;
}

function renderThreadsPage() {
  const backToTop = document.getElementById("backToTop");
  const threadList = document.getElementById("threadList");

  if (!threadList) return;

  enforceClosingRedirect();

  let composingThreadId = null;

  function render() {
    const threads = ensureThreadSlots(loadThreads());
    saveThreads(threads);

    threadList.innerHTML = "";

    threads.forEach(thread => {
      const isEmpty = thread.theme.trim() === "";
      const isOpen = isEmpty && composingThreadId === thread.id;
      const card = document.createElement("article");
      card.className = isEmpty ? "thread-card empty" : "thread-card";

      if (isOpen) {
        card.classList.add("is-composer-open");
      }

      if (isEmpty) {
        card.innerHTML = `
          <div class="empty-inner">
            <button class="plus-button" type="button" data-thread-id="${thread.id}" aria-label="Create thread">+</button>
            <div class="empty-text">Tap plus to create a thread</div>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="thread-title">${escapeHtml(thread.theme)}</div>
          ${
            thread.link
              ? `<a class="thread-link" href="${escapeHtml(thread.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(thread.link)}</a>`
              : ""
          }
          <div class="thread-actions">
            <button class="join-button" type="button" data-thread-id="${thread.id}">Open</button>
          </div>
        `;
      }

      threadList.appendChild(card);

      if (isOpen) {
        const composerCard = document.createElement("article");
        composerCard.className = "thread-card composer-panel";
        composerCard.innerHTML = `
          <div class="composer">
            <div class="composer-head">
              <div class="composer-title">New thread</div>
              <button class="close-composer-button" type="button" data-thread-id="${thread.id}" aria-label="Close">x</button>
            </div>
            <label class="form-label" for="threadThemeInput">Theme</label>
            <input
              type="text"
              id="threadThemeInput"
              class="form-input"
              placeholder="Enter thread theme"
              maxlength="80"
            />
            <label class="form-label" for="threadLinkInput">Link (optional)</label>
            <input
              type="text"
              id="threadLinkInput"
              class="form-input"
              placeholder="Paste a URL"
            />
            <button id="createThreadBtn" class="primary-button" type="button" disabled>Post</button>
          </div>
        `;
        threadList.appendChild(composerCard);
      }
    });

    threadList.querySelectorAll(".plus-button").forEach(button => {
      button.addEventListener("click", () => {
        composingThreadId = button.dataset.threadId;
        render();
      });
    });

    threadList.querySelectorAll(".close-composer-button").forEach(button => {
      button.addEventListener("click", () => {
        if (composingThreadId === button.dataset.threadId) {
          composingThreadId = null;
          render();
        }
      });
    });

    threadList.querySelectorAll(".join-button").forEach(button => {
      button.addEventListener("click", () => {
        window.location.href = `thread.html?id=${encodeURIComponent(button.dataset.threadId)}`;
      });
    });

    const themeInput = document.getElementById("threadThemeInput");
    const linkInput = document.getElementById("threadLinkInput");
    const createThreadBtn = document.getElementById("createThreadBtn");

    if (themeInput && createThreadBtn) {
      const syncSubmitState = () => {
        createThreadBtn.disabled = themeInput.value.trim() === "";
      };

      themeInput.addEventListener("input", syncSubmitState);
      themeInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !createThreadBtn.disabled) {
          createThreadBtn.click();
        }
      });
      syncSubmitState();
      themeInput.focus();

      createThreadBtn.addEventListener("click", () => {
        const theme = themeInput.value.trim();
        const link = normalizeLink(linkInput ? linkInput.value : "");

        if (!theme || !composingThreadId) {
          return;
        }

        const latestThreads = loadThreads();
        const activeCount = latestThreads.filter(thread => thread.theme.trim() !== "").length;
        if (activeCount >= MAX_THREADS) {
          alert("You can create up to 10 threads.");
          composingThreadId = null;
          render();
          return;
        }

        const target = latestThreads.find(thread => thread.id === composingThreadId);
        if (!target) {
          return;
        }

        target.theme = theme;
        target.link = link;
        target.createdAt = new Date().toISOString();
        target.messages = [];
        saveThreads(ensureThreadSlots(latestThreads));
        composingThreadId = null;
        render();
      });
    }
  }

  backToTop.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  render();
}

function renderThreadPage() {
  const threadInfo = document.getElementById("threadInfo");
  const messageList = document.getElementById("messageList");
  const messageInput = document.getElementById("messageInput");
  const sendMessageBtn = document.getElementById("sendMessageBtn");

  if (!threadInfo || !messageList || !messageInput || !sendMessageBtn) return;

  enforceClosingRedirect();

  const params = new URLSearchParams(window.location.search);
  const threadId = params.get("id");

  let threads = loadThreads();
  let thread = threads.find(item => item.id === threadId);

  if (!thread || !thread.theme.trim()) {
    alert("Thread not found.");
    window.location.href = "threads.html";
    return;
  }

  function renderInfo() {
    threadInfo.innerHTML = `
      <div class="thread-sticky-bar">
        <button class="back-button thread-back-button" id="backToThreadsInline" aria-label="Back">Back</button>
        <div class="thread-info-box">
          <div class="thread-theme">${escapeHtml(thread.theme)}</div>
          ${
            thread.link
              ? `<a class="thread-meta-link" href="${escapeHtml(thread.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(thread.link)}</a>`
              : ""
          }
        </div>
      </div>
    `;

    const inlineBackButton = document.getElementById("backToThreadsInline");
    if (inlineBackButton) {
      inlineBackButton.addEventListener("click", () => {
        window.location.href = "threads.html";
      });
    }
  }

  function renderMessages() {
    threads = loadThreads();
    thread = threads.find(item => item.id === threadId);

    if (!thread) {
      return;
    }

    messageList.innerHTML = "";

    if (!thread.messages.length) {
      messageList.innerHTML = `<div class="message-item">No comments yet.</div>`;
      return;
    }

    thread.messages.forEach(message => {
      const item = document.createElement("div");
      item.className = "message-item";
      item.innerHTML = `
        <div>${escapeHtml(message.text)}</div>
        <div class="message-time">${formatTime(message.createdAt)}</div>
      `;
      messageList.appendChild(item);
    });
  }

  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    threads = loadThreads();
    const target = threads.find(item => item.id === threadId);
    if (!target) return;

    target.messages.push({
      id: generateId(),
      text,
      createdAt: new Date().toISOString()
    });

    saveThreads(threads);
    messageInput.value = "";
    renderMessages();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  sendMessageBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
  renderInfo();
  renderMessages();
}

document.addEventListener("DOMContentLoaded", () => {
  renderThreadsPage();
  renderThreadPage();
});
