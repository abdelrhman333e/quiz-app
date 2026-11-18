const roomForm = document.getElementById("roomForm");
const roomCodeInput = document.getElementById("roomCode");
const buzzerPanel = document.getElementById("buzzerPanel");
const joinedRoom = document.getElementById("joinedRoom");
const connectionStatus = document.getElementById("connectionStatus");
const contestants = document.getElementById("contestants");
const questionStatus = document.getElementById("questionStatus");
const buzzButton = document.getElementById("buzzButton");
const passwordModal = document.getElementById("contestantPasswordModal");
const passwordForm = document.getElementById("contestantPasswordForm");
const passwordInput = document.getElementById("contestantPassword");
const passwordContestantName = document.getElementById("passwordContestantName");
const passwordError = document.getElementById("passwordError");
const cancelPasswordButton = document.getElementById("cancelContestantPassword");
const confirmPasswordButton = document.getElementById("confirmContestantPassword");
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
let passwordContestantId = "";

function setConnectionStatus(message, kind = "") {
  connectionStatus.textContent = message;
  connectionStatus.className = `connection-status ${kind}`;
}

function render() {
  contestants.replaceChildren();
  const players = state?.players || [];
  buzzerPanel.dataset.state =
    state?.buzzed ? "buzzed" : state?.active ? "ready" : "waiting";
  if (!players.some((player) => player.id === selectedContestantId))
    selectedContestantId = "";
  players.forEach((player) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `contestant-option${player.id === selectedContestantId ? " selected" : ""}`;
    option.textContent = player.n;
    option.setAttribute(
      "aria-pressed",
      String(player.id === selectedContestantId),
    );
    option.addEventListener("click", () => {
      openPasswordDialog(player);
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

function openPasswordDialog(player) {
  passwordContestantId = player.id;
  passwordContestantName.textContent = player.n;
  passwordError.textContent = "";
  passwordInput.value = "";
  passwordModal.hidden = false;
  passwordInput.disabled = false;
  confirmPasswordButton.disabled = false;
  confirmPasswordButton.textContent = "تأكيد الاسم";
  passwordError.className = "password-error";
  passwordInput.classList.remove("password-input-error");
  setTimeout(() => passwordInput.focus(), 0);
}

function closePasswordDialog() {
  passwordModal.hidden = true;
  passwordContestantId = "";
  passwordInput.value = "";
  passwordError.textContent = "";
}

async function claimContestant(contestantId, password) {
  if (
    !contestantId ||
    selectionClaimInFlight === contestantId
  )
    return;
  if (!password) {
    passwordError.textContent = "اكتب رمز المتسابق أولًا";
    passwordError.className = "password-error password-error-bad";
    passwordInput.classList.add("password-input-error");
    passwordInput.focus();
    return;
  }
  selectionClaimInFlight = contestantId;
  requestMessage = "";
  passwordError.textContent = "";
  confirmPasswordButton.disabled = true;
  confirmPasswordButton.textContent = "جارٍ التحقق...";
  passwordInput.disabled = true;
  try {
    const response = await fetch("/api/buzzer/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room,
        contestantId,
        clientId: buzzerClientId,
        password,
        displayId: state?.displayId || "",
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      requestMessage = result.error || "تعذر اختيار اسم المتسابق";
      passwordError.textContent =
        result.error || "تعذر تأكيد هوية المتسابق";
      passwordError.className = "password-error password-error-bad";
      passwordInput.classList.add("password-input-error");
      passwordInput.select();
    } else {
      selectedContestantId = contestantId;
      claimedContestantId = contestantId;
      localStorage.setItem(`quizBuzzerSelected:${room}`, contestantId);
      requestMessage = "تم تأكيد الاسم بنجاح";
      passwordInput.classList.remove("password-input-error");
      closePasswordDialog();
    }
  } catch {
    requestMessage = "تعذر الاتصال، تحقق من الإنترنت وحاول مجددًا";
    passwordError.textContent = requestMessage;
    passwordError.className = "password-error password-error-bad";
  } finally {
    selectionClaimInFlight = "";
    confirmPasswordButton.disabled = false;
    confirmPasswordButton.textContent = "تأكيد الاسم";
    passwordInput.disabled = false;
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
        clientId: buzzerClientId,
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
  selectedContestantId = "";
  claimedContestantId = "";
  lastDisplayId = "";
  joinedRoom.textContent = room;
  buzzerPanel.hidden = false;
  document.body.classList.add("room-connected");
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
passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!passwordContestantId) return;
  passwordError.textContent = "";
  claimContestant(passwordContestantId, passwordInput.value.trim());
});
cancelPasswordButton.addEventListener("click", closePasswordDialog);
passwordModal.addEventListener("click", (event) => {
  if (event.target === passwordModal) closePasswordDialog();
});
roomCodeInput.value = new URLSearchParams(location.search).get("room") || "";
if (roomCodeInput.value) joinRoom(roomCodeInput.value);
