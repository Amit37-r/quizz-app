const url = new URL(window.location.href);
const name = url.searchParams.get("name") || "Teacher";
const room = (url.searchParams.get("room") || "DEFAULT").toUpperCase();

document.getElementById("roomLabel").textContent = room;

const socket = io();

let participants = {};
let currentResults = [];

socket.emit("joinRoom", { roomCode: room, role: "teacher", name });

socket.on("joinError", (msg) => {
  alert(msg);
  window.location.href = "index.html";
});

socket.on("joined", ({ history, currentQuestion }) => {
  renderHistory(history || []);
  if (currentQuestion) {
    renderCurrentQuestion(currentQuestion);
    document.getElementById("endBtn").disabled = false;
  }
});

// ----- Create options UI -----
const optionsContainer = document.getElementById("optionsContainer");

function createOptionRow(index, value = "", isCorrect = false) {
  const wrapper = document.createElement("div");
  wrapper.className = "option-item";
  wrapper.innerHTML = `
      <div class="option-badge">${index + 1}</div>
      <input class="input option-text" value="${value}" placeholder="Option ${
    index + 1
  }" />
      <div class="radio-group">
        <span>Correct?</span>
        <input type="radio" name="correctOption" class="opt-correct" ${
          isCorrect ? "checked" : ""
        } />
      </div>
  `;
  optionsContainer.appendChild(wrapper);
}

function gatherOptions() {
  const texts = Array.from(
    document.querySelectorAll(".option-text")
  ).map((el) => el.value.trim());

  const radios = Array.from(
    document.querySelectorAll(".opt-correct")
  );

  const correctIndex = radios.findIndex((r) => r.checked);

  return texts
    .map((t, idx) => ({
      text: t,
      isCorrect: idx === correctIndex,
    }))
    .filter((o) => o.text);
}

// initial 2 options
createOptionRow(0);
createOptionRow(1);

document.getElementById("addOptionBtn").onclick = () => {
  const index = document.querySelectorAll(".option-item").length;
  createOptionRow(index);
};

// ----- Ask / End question -----
document.getElementById("askBtn").onclick = () => {
  const text = document.getElementById("questionInput").value.trim();
  const duration = parseInt(
    document.getElementById("durationSelect").value,
    10
  );
  const options = gatherOptions();

  if (!text || options.length < 2) {
    alert("Enter question and at least 2 options.");
    return;
  }

  socket.emit("createQuestion", { text, options, duration });

  document.getElementById("endBtn").disabled = false;
};

document.getElementById("endBtn").onclick = () => {
  socket.emit("endQuestion");
  document.getElementById("endBtn").disabled = true;
};

// ----- Receive events -----
socket.on("newQuestion", (q) => {
  renderCurrentQuestion(q);
});

socket.on("resultsUpdate", ({ counts }) => {
  currentResults = counts;
  updateResultsBars();
});

socket.on("questionEnded", ({ history }) => {
  document.getElementById("currentQuestionArea").innerHTML =
    "<p class='sub'>No active question. Ask a new one.</p>";
  renderHistory(history);
});

socket.on("participantsUpdate", ({ participants: p }) => {
  participants = p;
  renderParticipants();
});

socket.on("teacherLeft", () => {
  // not used here
});

// ----- Render helpers -----
function renderCurrentQuestion(q) {
  const area = document.getElementById("currentQuestionArea");
  const remaining =
    q.duration -
    Math.floor((Date.now() - q.startedAt) / 1000);

  area.innerHTML = `
    <div class="row-space">
      <div class="label">Question 1</div>
      <div class="timer">
        ⏱ <span class="time" id="timerText">
          ${remaining > 0 ? "00:" + String(remaining).padStart(2, "0") : "00:00"}
        </span>
      </div>
    </div>
    <div class="question-box">
      <div class="question-header">${q.text}</div>
      <div id="currentOptions"></div>
    </div>
  `;

  const list = document.getElementById("currentOptions");
  list.innerHTML = "";

  q.options.forEach((opt, idx) => {
    const row = document.createElement("div");
    row.className = "option-display";
    row.innerHTML = `
      <div class="results-row">
        <div>${idx + 1}. ${opt.text}</div>
        <div style="width:60px;text-align:right" id="percent-${idx}">0%</div>
      </div>
      <div class="bar-bg mt-2">
        <div class="bar-fill" id="bar-${idx}" style="width:0%"></div>
      </div>
    `;
    list.appendChild(row);
  });

  // local timer countdown
  let timeLeft = remaining;
  const timerEl = document.getElementById("timerText");
  const interval = setInterval(() => {
    timeLeft--;
    if (!timerEl) return clearInterval(interval);
    if (timeLeft < 0) {
      timerEl.textContent = "00:00";
      return clearInterval(interval);
    }
    timerEl.textContent =
      "00:" + String(timeLeft).padStart(2, "0");
  }, 1000);
}

function updateResultsBars() {
  const total = currentResults.reduce((a, b) => a + b, 0) || 1;
  currentResults.forEach((c, idx) => {
    const percent = Math.round((c / total) * 100);
    const bar = document.getElementById("bar-" + idx);
    const label = document.getElementById("percent-" + idx);
    if (bar) bar.style.width = percent + "%";
    if (label) label.textContent = percent + "%";
  });
}

function renderHistory(history) {
  const container = document.getElementById("historyList");
  container.innerHTML = "";
  history.forEach((q, qIndex) => {
    const wrapper = document.createElement("div");
    wrapper.className = "mt-3 question-box";
    wrapper.innerHTML = `
      <div class="question-header">Question ${
        history.length - qIndex
      }: ${q.text}</div>
      <div class="option-display" id="hist-${q.id}"></div>
    `;
    container.appendChild(wrapper);

    const inner = wrapper.querySelector(".option-display");
    const total = (q.results || []).reduce((a, b) => a + b, 0) || 1;

    q.options.forEach((opt, idx) => {
      const p = Math.round(((q.results || [])[idx] || 0) / total * 100);
      const row = document.createElement("div");
      row.className = "mt-2";
      row.innerHTML = `
        <div class="results-row">
          <div>${idx + 1}. ${opt.text}</div>
          <div style="width:60px;text-align:right">${p}%</div>
        </div>
        <div class="bar-bg mt-1">
          <div class="bar-fill" style="width:${p}%"></div>
        </div>
      `;
      inner.appendChild(row);
    });
  });
}

// ----- Chat widget shared -----
const chatToggle = document.getElementById("chatToggle");
const chatPanel = document.getElementById("chatPanel");
const chatTabs = document.querySelectorAll(".chat-tab");
const chatTabBody = document.getElementById("chatTab");
const participantsTab = document.getElementById("participantsTab");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");

chatToggle.onclick = () => {
  chatPanel.classList.toggle("open");
};

chatTabs.forEach((tab) => {
  tab.onclick = () => {
    chatTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    if (tab.dataset.tab === "chat") {
      chatTabBody.style.display = "block";
      participantsTab.style.display = "none";
    } else {
      chatTabBody.style.display = "none";
      participantsTab.style.display = "block";
    }
  };
});

chatSendBtn.onclick = sendChat;
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chatMessage", { text });
  chatInput.value = "";
}

socket.on("chatMessage", ({ from, role, text }) => {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble " + (from === name ? "me" : "other");
  bubble.textContent = `${from}: ${text}`;
  chatTabBody.appendChild(bubble);
  chatTabBody.scrollTop = chatTabBody.scrollHeight;
});

function renderParticipants() {
  participantsTab.innerHTML = "";
  Object.entries(participants).forEach(([id, p]) => {
    const row = document.createElement("div");
    row.className = "row-space mt-2";
    row.innerHTML = `
      <div style="font-size:0.85rem">${p.name} ${
      p.role === "teacher" ? "(Teacher)" : ""
    }</div>
      ${
        p.role === "student"
          ? `<span class="kick-link" data-id="${id}">Kick out</span>`
          : ""
      }
    `;
    participantsTab.appendChild(row);
  });

  participantsTab.querySelectorAll(".kick-link").forEach((link) => {
    link.onclick = () => {
      const id = link.dataset.id;
      if (confirm("Kick this student out?")) {
        socket.emit("kickUser", { targetId: id });
      }
    };
  });
}
