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
let eventSource = null;
let submitting = false;
let requestMessage = "";

function setConnectionStatus(message, kind = "") {
  connectionStatus.textContent = message;
  connectionStatus.className = `connection-status ${kind}`;
}

function render() {
  contestants.replaceChildren();
  const players = state?.players || [];
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
      selectedContestantId = player.id;
      render();
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
  selectedContestantId = "";
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
roomCodeInput.value = new URLSearchParams(location.search).get("room") || "";
if (roomCodeInput.value) joinRoom(roomCodeInput.value);
