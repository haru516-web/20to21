import { db } from "./firebase.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const MAX_THREADS = 10;
const CLOSE_HOUR = 21;
const CLOSE_MINUTE = 0;
const FORCE_OPEN = false;

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

function formatTime(value) {
  if (!value) return "";

  const date = typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

function mapThreadDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    theme: data.theme || "",
    link: data.link || "",
    createdAt: data.createdAt || null
  };
}

function renderThreadsPage() {
  const backToTop = document.getElementById("backToTop");
  const threadList = document.getElementById("threadList");

  if (!threadList || !backToTop) return;

  enforceClosingRedirect();

  let threads = [];
  let composingThreadId = null;

  function render() {
    const canCreateMore = threads.length < MAX_THREADS;
    threadList.innerHTML = "";

    threads.forEach(thread => {
      const card = document.createElement("article");
      card.className = "thread-card";
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
      threadList.appendChild(card);
    });

    if (canCreateMore) {
      const emptyCard = document.createElement("article");
      emptyCard.className = "thread-card empty";
      if (composingThreadId) {
        emptyCard.classList.add("is-composer-open");
      }
      emptyCard.innerHTML = `
        <div class="empty-inner">
          <button class="plus-button" type="button" aria-label="Create thread">+</button>
          <div class="empty-text">Tap plus to create a thread</div>
        </div>
      `;
      threadList.appendChild(emptyCard);

      if (composingThreadId) {
        const composerCard = document.createElement("article");
        composerCard.className = "thread-card composer-panel";
        composerCard.innerHTML = `
          <div class="composer">
            <div class="composer-head">
              <div class="composer-title">New thread</div>
              <button class="close-composer-button" type="button" aria-label="Close">x</button>
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
    }

    threadList.querySelectorAll(".join-button").forEach(button => {
      button.addEventListener("click", () => {
        window.location.href = `thread.html?id=${encodeURIComponent(button.dataset.threadId)}`;
      });
    });

    const plusButton = threadList.querySelector(".plus-button");
    if (plusButton) {
      plusButton.addEventListener("click", () => {
        composingThreadId = "new-thread-slot";
        render();
      });
    }

    const closeButton = threadList.querySelector(".close-composer-button");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        composingThreadId = null;
        render();
      });
    }

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

      createThreadBtn.addEventListener("click", async () => {
        const theme = themeInput.value.trim();
        const link = normalizeLink(linkInput ? linkInput.value : "");

        if (!theme) {
          return;
        }

        if (threads.length >= MAX_THREADS) {
          alert("You can create up to 10 threads.");
          composingThreadId = null;
          render();
          return;
        }

        createThreadBtn.disabled = true;

        try {
          await addDoc(collection(db, "threads"), {
            theme,
            link,
            createdAt: serverTimestamp()
          });
          composingThreadId = null;
        } catch (error) {
          alert("Thread creation failed.");
          createThreadBtn.disabled = false;
        }
      });
    }
  }

  const threadQuery = query(collection(db, "threads"), orderBy("createdAt", "asc"));
  onSnapshot(threadQuery, snapshot => {
    threads = snapshot.docs.map(mapThreadDoc).slice(0, MAX_THREADS);
    render();
  }, () => {
    threadList.innerHTML = `<div class="message-item">Failed to load threads.</div>`;
  });

  backToTop.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

async function renderThreadPage() {
  const threadInfo = document.getElementById("threadInfo");
  const messageList = document.getElementById("messageList");
  const messageInput = document.getElementById("messageInput");
  const sendMessageBtn = document.getElementById("sendMessageBtn");
  const messageInputBar = document.querySelector(".message-input-bar");

  if (!threadInfo || !messageList || !messageInput || !sendMessageBtn) return;

  enforceClosingRedirect();

  const params = new URLSearchParams(window.location.search);
  const threadId = params.get("id");

  if (!threadId) {
    window.location.href = "threads.html";
    return;
  }

  const threadRef = doc(db, "threads", threadId);
  const threadSnapshot = await getDoc(threadRef);
  let lastMessageCount = 0;

  if (!threadSnapshot.exists()) {
    alert("Thread not found.");
    window.location.href = "threads.html";
    return;
  }

  function renderInfo(thread) {
    threadInfo.innerHTML = `
      <div class="thread-sticky-bar">
        <button class="back-button thread-back-button" id="backToThreadsInline" aria-label="Back">&#x21A9;</button>
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

  function scrollLatestMessageIntoView() {
    const latestMessage = messageList.lastElementChild;
    if (!latestMessage) {
      return;
    }

    const inputBarHeight = messageInputBar ? messageInputBar.getBoundingClientRect().height : 0;
    const latestRect = latestMessage.getBoundingClientRect();
    const absoluteBottom = latestRect.bottom + window.scrollY;
    const visibleHeight = window.innerHeight - inputBarHeight - 12;
    const targetScrollTop = Math.max(0, absoluteBottom - visibleHeight);

    window.scrollTo({ top: targetScrollTop, behavior: "smooth" });
  }

  onSnapshot(threadRef, snapshot => {
    if (!snapshot.exists()) {
      alert("Thread not found.");
      window.location.href = "threads.html";
      return;
    }
    renderInfo(mapThreadDoc(snapshot));
  });

  const messagesQuery = query(collection(db, "threads", threadId, "messages"), orderBy("createdAt", "asc"));
  onSnapshot(messagesQuery, snapshot => {
    const previousMessageCount = lastMessageCount;
    lastMessageCount = snapshot.docs.length;

    messageList.innerHTML = "";

    if (!snapshot.docs.length) {
      messageList.innerHTML = `<div class="message-item">No comments yet.</div>`;
      return;
    }

    snapshot.docs.forEach(messageSnapshot => {
      const message = messageSnapshot.data();
      const item = document.createElement("div");
      item.className = "message-item";
      item.innerHTML = `
        <div>${escapeHtml(message.text || "")}</div>
        <div class="message-time">${formatTime(message.createdAt)}</div>
      `;
      messageList.appendChild(item);
    });

    if (snapshot.docs.length > previousMessageCount) {
      requestAnimationFrame(() => {
        scrollLatestMessageIntoView();
        setTimeout(scrollLatestMessageIntoView, 120);
      });
    }
  }, () => {
    messageList.innerHTML = `<div class="message-item">Failed to load comments.</div>`;
  });

  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    sendMessageBtn.disabled = true;

    try {
      await addDoc(collection(db, "threads", threadId, "messages"), {
        text,
        createdAt: serverTimestamp()
      });
      messageInput.value = "";
    } catch (error) {
      alert("Comment send failed.");
    } finally {
      sendMessageBtn.disabled = false;
    }
  }

  sendMessageBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderThreadsPage();
  renderThreadPage();
});
