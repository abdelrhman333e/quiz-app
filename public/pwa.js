if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.error("تعذر تسجيل Service Worker:", error);
  });
}

const installButton = document.getElementById("installApp");
if (installButton) {
  let installPrompt;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS || window.isSecureContext) installButton.hidden = false;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installButton.hidden = true;
      return;
    }

    if (isIOS) {
      alert('لتثبيت التطبيق: اضغط "مشاركة" في Safari، ثم اختر "إضافة إلى الشاشة الرئيسية".');
    } else if (window.isSecureContext) {
      alert('افتح قائمة المتصفح واختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".');
    } else {
      alert("يلزم فتح الموقع عبر HTTPS حتى تتمكن من تثبيته كتطبيق.");
    }
  });

  window.addEventListener("appinstalled", () => {
    installButton.hidden = true;
    installPrompt = null;
  });
}
