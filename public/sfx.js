var sfxContext = null;
var sfxEnabled = true;
var resultSounds = {
  correct: new Audio("/sound/correct.wav"),
  wrong: new Audio("/sound/lose.wav"),
};

function resumeSfx() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!sfxContext) sfxContext = new AudioContextClass();
  if (sfxEnabled && sfxContext.state !== "running")
    sfxContext
      .resume()
      .catch((error) => console.error("تعذر تشغيل المؤثرات الصوتية:", error));
}

function unlockSfx() {
  document.removeEventListener("pointerdown", unlockSfx);
  document.removeEventListener("keydown", unlockSfx);
  resumeSfx();
}

document.addEventListener("pointerdown", unlockSfx);
document.addEventListener("keydown", unlockSfx);
resumeSfx();

function toggleSfx(buttonId = "screenSfxToggle") {
  sfxEnabled = !sfxEnabled;
  if (sfxEnabled) {
    resumeSfx();
    if (sfxContext) playSfx("question");
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
