const THEME_KEY = "quizTheme";
const THEMES = [
  { id: "dark", label: "ليلي أزرق", icon: "🌙" },
  { id: "light", label: "نهاري", icon: "☀️" },
  { id: "green", label: "أخضر", icon: "🌿" },
  { id: "black", label: "أسود", icon: "⬛" },
];
let currentTheme = "dark";

try {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (THEMES.some((theme) => theme.id === savedTheme))
    currentTheme = savedTheme;
} catch (error) {
  console.warn("تعذر قراءة الوضع المحفوظ؛ سيتم استخدام الوضع الليلي.", error);
}

function updateThemeControls() {
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    const selected = button.dataset.themeOption === currentTheme;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    const theme = THEMES.find((option) => option.id === currentTheme);
    toggle.textContent = `${theme.icon} ${theme.label}`;
    toggle.setAttribute("aria-label", `الثيم الحالي: ${theme.label}. اضغط للتغيير.`);
    toggle.title = "التبديل إلى الثيم التالي";
  }
}

function setTheme(themeId) {
  if (!THEMES.some((theme) => theme.id === themeId)) return;
  currentTheme = themeId;
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.style.colorScheme =
    currentTheme === "light" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, currentTheme);
  } catch (error) {
    console.error("تعذر حفظ الثيم المختار:", error);
  }
  updateThemeControls();
}

function cycleTheme() {
  const currentIndex = THEMES.findIndex((theme) => theme.id === currentTheme);
  setTheme(THEMES[(currentIndex + 1) % THEMES.length].id);
}

function themeOptionsHTML() {
  return `<div class="theme-options" role="group" aria-label="اختيار الثيم">${THEMES.map(
    (theme) =>
      `<button type="button" class="theme-option${theme.id === currentTheme ? " selected" : ""}" data-theme-option="${theme.id}" aria-pressed="${theme.id === currentTheme}" onclick="setTheme('${theme.id}')"><span class="theme-option-icon" aria-hidden="true">${theme.icon}</span><span>${theme.label}</span></button>`,
  ).join("")}</div>`;
}

document.documentElement.dataset.theme = currentTheme;
document.documentElement.style.colorScheme =
  currentTheme === "light" ? "light" : "dark";
document.addEventListener("DOMContentLoaded", () => {
  if (!location.pathname.startsWith("/tablet")) {
    const button = document.createElement("button");
    button.id = "themeToggle";
    button.className = "theme-toggle";
    button.type = "button";
    button.addEventListener("click", cycleTheme);
    document.body.appendChild(button);
  }
  updateThemeControls();
});
