const url = new URL(window.location.href);
const name = url.searchParams.get("name") || "Student";
const room = (url.searchParams.get("room") || "DEFAULT").toUpperCase();

const socket = io();

let participants = {};
let selectedIndex = null;

socket.emit("joinRoom", { roomCode: room, role: "student", name });

socket.on("joinError", (msg) => {
  alert(msg);
  window.location.href = "index.html";
});

socket.on("joined", ({ currentQuestion }) => {
  if (currentQuestion) {
    showQuestion(currentQuestion);
  }
});

socket.on("newQuestion", (q) => {
  selectedIndex = null;
  showQuestion(q);
});

socket.on("questionEnded", () => {
  document.getElementById("questionArea").innerHTML = "";
  document.getElementById("statusArea").innerHTML =
    "<h2>Wait for the teacher to ask a new question.</h2>";
});

socket.on("participantsUpdate", ({ participants: p }) => {
  participants = p;
  renderParticipants();
});

socket.on("kicked", () => {
  document.getElementById("mainPage").style.display = "none";
  document.getElementById("kickedPage").style.display = "block";
});

socket.on("teacherLeft", () => {
  document.getElementById("statusArea").innerHTML =
    "<h2>Teacher disconnected. Session ended.</h2>";
});

// ----- Render question -----
function showQuestion(q) {
  document.getElementById("statusArea").innerHTML = `
    <div class="row-space">
      <h2>Question</h2>
      <div class="timer">
        ⏱ <span class="time" id="timerText"></span>
      </div>
    </div>
  `;

  const area = document.getElementById("questionArea");
  area.innerHTML = `
    <div class="question-box">
      <div class="question-header">${q.text}</div>
      <div id="studentOptions"></div>
    </div>
    <div class="mt-3">
      <button class="btn-primary" id="submitBtn">Submit</button>
    </div>
  `;

  const optList = document.getElementById("studentOptions");
  optList.innerHTML = "";
  q.options.forEach((opt, idx) => {
    const row = document.createElement("div");
    row.className = "option-display";
    row.dataset.idx = idx;
    row.innerHTML = `${idx + 1}. ${opt.text}`;
    row.onclick = () => {
      selectedIndex = idx;
      document
        .querySelectorAll(".option-display")
        .forEach((el) => el.classList.remove("selected"));
      row.classList.add("selected");
    };
    optList.appendChild(row);
  });

  document.getElementById("submitBtn").onclick = () => {
    if (selectedIndex == null) {
      alert("Please select an option.");
      return;
    }
    socket.emit("submitAnswer", { optionIndex: selectedIndex });
    document.getElementById("submitBtn").disabled = true;
  };

  // timer
  const timerEl = document.getElementById("timerText");
  let remaining =
    q.duration -
    Math.floor((Date.now() - q.startedAt) / 1000);
  remaining = Math.max(0, remaining);

  timerEl.textContent =
    "00:" + String(remaining).padStart(2, "0");
  const interval = setInterval(() => {
    remaining--;
    if (!timerEl) return clearInterval(interval);
    if (remaining < 0) {
      timerEl.textContent = "00:00";
      clearInterval(interval);
      return;
    }
    timerEl.textContent =
      "00:" + String(remaining).padStart(2, "0");
  }, 1000);
}

// ----- Chat widget (same pattern as teacher) -----
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

socket.on("chatMessage", ({ from, text }) => {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble " + (from === name ? "me" : "other");
  bubble.textContent = `${from}: ${text}`;
  chatTabBody.appendChild(bubble);
  chatTabBody.scrollTop = chatTabBody.scrollHeight;
});

function renderParticipants() {
  participantsTab.innerHTML = "";
  Object.values(participants).forEach((p) => {
    const row = document.createElement("div");
    row.className = "mt-2";
    row.style.fontSize = "0.85rem";
    row.textContent = `${p.name} ${p.role === "teacher" ? "(Teacher)" : ""}`;
    participantsTab.appendChild(row);
  });
}
