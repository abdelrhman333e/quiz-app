const THEME_KEY = "quizTheme";
let savedTheme = null;
try {
  savedTheme = localStorage.getItem(THEME_KEY);
} catch (error) {
  console.warn("تعذر قراءة الوضع المحفوظ؛ سيتم استخدام الوضع الليلي.", error);
}
let currentTheme = savedTheme === "light" ? "light" : "dark";

function applyTheme() {
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.style.colorScheme = currentTheme;
  const button = document.getElementById("themeToggle");
  if (!button) return;
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  button.textContent =
    nextTheme === "light" ? "☀️ الوضع النهاري" : "🌙 الوضع الليلي";
  button.setAttribute(
    "aria-label",
    `التبديل إلى الوضع ${nextTheme === "light" ? "النهاري" : "الليلي"}`,
  );
  button.title = `التبديل إلى الوضع ${nextTheme === "light" ? "النهاري" : "الليلي"}`;
}

function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, currentTheme);
  } catch (error) {
    console.error("تعذر حفظ الوضع المختار:", error);
  }
  applyTheme();
}

applyTheme();
document.addEventListener("DOMContentLoaded", () => {
  const button = document.createElement("button");
  button.id = "themeToggle";
  button.className = "theme-toggle";
  button.type = "button";
  button.addEventListener("click", toggleTheme);
  document.body.appendChild(button);
  applyTheme();
});
