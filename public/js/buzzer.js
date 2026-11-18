const roomForm = document.getElementById("roomForm");
const roomCodeInput = document.getElementById("roomCode");
const buzzerPanel = document.getElementById("buzzerPanel");
const joinedRoom = document.getElementById("joinedRoom");
const connectionStatus = document.getElementById("connectionStatus");
const contestants = document.getElementById("contestants");
const questionStatus = document.getElementById("questionStatus");
const buzzButton = document.getElementById("buzzButton");
let room = "";
let state = null;
let selectedContestantId = "";
let claimedContestantId = "";
let selectionClaimInFlight = "";
const buzzerClientId =
  localStorage.getItem("quizBuzzerClientId") ||
  (() => {
    const id =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
            value.toString(16).padStart(2, "0"),
          ).join("");
    localStorage.setItem("quizBuzzerClientId", id);
    return id;
  })();
let eventSource = null;
let submitting = false;
let requestMessage = "";
let lastDisplayId = "";

function setConnectionStatus(message, kind = "") {
  connectionStatus.textContent = message;
  connectionStatus.className = `connection-status ${kind}`;
}

function render() {
  contestants.replaceChildren();
  const players = state?.players || [];
  const claimedIds = new Set(state?.claimedIds || []);
  if (!players.some((player) => player.id === selectedContestantId))
    selectedContestantId = "";
  players.forEach((player) => {
    const option = document.createElement("button");
    option.type = "button";
    const occupiedByOther =
      claimedIds.has(player.id) && player.id !== claimedContestantId;
    option.className = `contestant-option${player.id === selectedContestantId ? " selected" : ""}${occupiedByOther ? " occupied" : ""}`;
    option.textContent = player.n;
    option.disabled = occupiedByOther;
    option.setAttribute(
      "aria-pressed",
      String(player.id === selectedContestantId),
    );
    option.addEventListener("click", () => {
      claimContestant(player.id);
    });
    contestants.append(option);
  });

  if (!players.length) {
    questionStatus.textContent =
      "لا يوجد متسابقون. اطلب من مقدم المسابقة إضافتهم أولًا.";
  } else if (state?.buzzed) {
    questionStatus.textContent =
      state.buzzed.id === selectedContestantId
        ? "أنت أول من ضغط الجرس!"
        : `${state.buzzed.n} ضغط الجرس أولًا`;
  } else if (!state?.displayId) {
    questionStatus.textContent = "استنى مقدم المسابقة يعرض السؤال";
  } else if (!state.active) {
    questionStatus.textContent = "الجرس غير متاح الآن";
  } else if (requestMessage) {
    questionStatus.textContent = requestMessage;
  } else {
    questionStatus.textContent = selectedContestantId
      ? "السؤال جاهز — اضغط عند معرفة الإجابة"
      : "اختار اسمك لتفعيل الجرس";
  }

  buzzButton.disabled =
    submitting ||
    !selectedContestantId ||
    !state?.active ||
    !state?.displayId;
}

async function claimContestant(contestantId) {
  if (
    !contestantId ||
    selectionClaimInFlight === contestantId ||
    !state?.displayId ||
    !state?.active
  )
    return;
  selectionClaimInFlight = contestantId;
  requestMessage = "";
  try {
    const response = await fetch("/api/buzzer/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room,
        contestantId,
        clientId: buzzerClientId,
        displayId: state.displayId,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      requestMessage = result.error || "تعذر اختيار اسم المتسابق";
      if (response.status === 409) {
        selectedContestantId = "";
        claimedContestantId = "";
        localStorage.removeItem(`quizBuzzerSelected:${room}`);
      }
    } else {
      selectedContestantId = contestantId;
      claimedContestantId = contestantId;
      localStorage.setItem(`quizBuzzerSelected:${room}`, contestantId);
      requestMessage = "";
    }
  } catch {
    requestMessage = "تعذر الاتصال، تحقق من الإنترنت وحاول مجددًا";
  } finally {
    selectionClaimInFlight = "";
    render();
  }
}

async function submitBuzz() {
  if (
    submitting ||
    !selectedContestantId ||
    !state?.active ||
    !state?.displayId
  )
    return;
  submitting = true;
  requestMessage = "";
  render();
  try {
    const response = await fetch("/api/buzzer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room,
        contestantId: selectedContestantId,
        displayId: state.displayId,
      }),
    });
    const result = await response.json();
    if (!response.ok) requestMessage = result.error || "تعذر تسجيل الضغطة";
    else {
      state = {
        ...state,
        active: false,
        buzzed: {
          id: selectedContestantId,
          n:
            state.players.find((player) => player.id === selectedContestantId)
              ?.n || "",
        },
      };
    }
  } catch {
    requestMessage = "تعذر الاتصال، تحقق من الإنترنت وحاول مجددًا";
  } finally {
    submitting = false;
    render();
  }
}

function joinRoom(code) {
  const normalizedRoom = code.trim().toLowerCase();
  if (!/^[a-f0-9]{8}$/.test(normalizedRoom)) {
    setConnectionStatus("رمز الغرفة يجب أن يتكون من 8 أرقام أو حروف", "error");
    buzzerPanel.hidden = true;
    return;
  }
  eventSource?.close();
  room = normalizedRoom;
  state = null;
  selectedContestantId =
    localStorage.getItem(`quizBuzzerSelected:${room}`) || "";
  claimedContestantId = "";
  lastDisplayId = "";
  joinedRoom.textContent = room;
  buzzerPanel.hidden = false;
  setConnectionStatus("جاري الاتصال بالغرفة...");
  render();
  eventSource = new EventSource(
    `/events?room=${encodeURIComponent(room)}&role=buzzer`,
  );
  eventSource.addEventListener("open", () =>
    setConnectionStatus("متصل بالغرفة", "connected"),
  );
  eventSource.addEventListener("buzzer", (event) => {
    state = JSON.parse(event.data);
    requestMessage = "";
    if (state.displayId !== lastDisplayId) {
      lastDisplayId = state.displayId || "";
      claimedContestantId = "";
    }
    if (
      state.active &&
      state.displayId &&
      selectedContestantId &&
      claimedContestantId !== selectedContestantId
    )
      claimContestant(selectedContestantId);
    render();
  });
  eventSource.onerror = () =>
    setConnectionStatus("الاتصال غير مستقر — نحاول إعادة الاتصال...", "error");
}

roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom(roomCodeInput.value);
});
buzzButton.addEventListener("click", submitBuzz);
window.addEventListener("pagehide", () => {
  if (!room || !claimedContestantId) return;
  const body = JSON.stringify({
    room,
    contestantId: claimedContestantId,
    clientId: buzzerClientId,
    release: true,
  });
  navigator.sendBeacon?.("/api/buzzer/claim", new Blob([body], {
    type: "application/json",
  }));
});
roomCodeInput.value = new URLSearchParams(location.search).get("room") || "";
if (roomCodeInput.value) joinRoom(roomCodeInput.value);
