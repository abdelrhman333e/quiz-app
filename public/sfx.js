var sfxContext = null;
var sfxEnabled = true;
try {
  if (localStorage.getItem("sfxEnabled") === "0") sfxEnabled = false;
} catch (error) {}
var resultSounds = {
  correct: new Audio("/sound/correct.wav"),
  wrong: new Audio("/sound/lose.wav"),
};
var sfxPrompt = null;

function saveSfxState() {
  try {
    localStorage.setItem("sfxEnabled", sfxEnabled ? "1" : "0");
  } catch (error) {}
}

function isScreenPage() {
  return location.pathname.indexOf("/screen") === 0;
}

function showSfxPrompt() {
  if (!isScreenPage() || !sfxEnabled || sfxPrompt) return;
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", syncSfxPrompt, {
      once: true,
    });
    return;
  }
  sfxPrompt = document.createElement("button");
  sfxPrompt.type = "button";
  sfxPrompt.id = "sfxPrompt";
  sfxPrompt.textContent = "🔊 اضغط هنا لتفعيل الصوت";
  sfxPrompt.setAttribute(
    "style",
    "position:fixed;left:0;right:0;bottom:24px;margin:0 auto;width:max-content;max-width:90vw;z-index:50;padding:16px 28px;font-size:20px;font-weight:700;border-radius:999px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.45)",
  );
  sfxPrompt.addEventListener("click", unlockSfx);
  document.body.appendChild(sfxPrompt);
}

function hideSfxPrompt() {
  if (!sfxPrompt) return;
  sfxPrompt.remove();
  sfxPrompt = null;
}

function syncSfxPrompt() {
  if (sfxContext && sfxContext.state === "running") hideSfxPrompt();
  else if (sfxEnabled) showSfxPrompt();
  else hideSfxPrompt();
}

function resumeSfx() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return Promise.resolve(false);
  if (!sfxContext) {
    sfxContext = new AudioContextClass();
    sfxContext.onstatechange = syncSfxPrompt;
  }
  if (!sfxEnabled || sfxContext.state === "running") {
    syncSfxPrompt();
    return Promise.resolve(sfxContext.state === "running");
  }
  return sfxContext
    .resume()
    .then(() => {
      syncSfxPrompt();
      return sfxContext.state === "running";
    })
    .catch((error) => {
      console.error("تعذر تشغيل المؤثرات الصوتية:", error);
      syncSfxPrompt();
      return false;
    });
}

function unlockResultSounds() {
  Object.values(resultSounds).forEach((audio) => {
    audio.muted = true;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {
        audio.muted = false;
      });
  });
}

function unlockSfx() {
  resumeSfx().then((running) => {
    if (!running) return;
    document.removeEventListener("pointerdown", unlockSfx);
    document.removeEventListener("keydown", unlockSfx);
    unlockResultSounds();
    hideSfxPrompt();
  });
}

document.addEventListener("pointerdown", unlockSfx);
document.addEventListener("keydown", unlockSfx);
resumeSfx();

function toggleSfx(buttonId = "screenSfxToggle") {
  sfxEnabled = !sfxEnabled;
  saveSfxState();
  if (sfxEnabled) {
    resumeSfx().then((running) => {
      if (!running) return;
      unlockResultSounds();
      playSfx("question");
    });
  } else {
    hideSfxPrompt();
  }
  updateSfxButton(buttonId);
}

function updateSfxButton(buttonId = "screenSfxToggle") {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.textContent = sfxEnabled
    ? "🔊 كتم المؤثرات"
    : "🔇 تفعيل المؤثرات";
  button.setAttribute("aria-pressed", String(sfxEnabled));
}

function playSfx(name) {
  if (!sfxEnabled || !sfxContext) return;
  if (resultSounds[name]) {
    const audio = resultSounds[name];
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.error(`تعذر تشغيل مؤثر ${name}:`, error);
    });
    return;
  }
  const notes =
    {
      question: [
        [523.25, 0, 0.09],
        [783.99, 0.11, 0.13],
      ],
      options: [[740, 0, 0.07]],
      answer: [[659.25, 0, 0.14]],
      contestant: [[440, 0, 0.08]],
      rank: [[587.33, 0, 0.07]],
      reverse: [[880, 0, 0.06]],
    }[name] || [];
  for (const [frequency, delay, duration] of notes) {
    const start = sfxContext.currentTime + delay;
    const oscillator = sfxContext.createOscillator();
    const gain = sfxContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(sfxContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
