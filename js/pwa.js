
// ============================================================
// StudyStudio — PWA Install & Service Worker Registration
// Registers sw.js for offline app-shell caching, and surfaces an
// "Install StudyStudio" button in Settings when the browser signals
// the app is actually installable (captured via beforeinstallprompt).
// The button stays hidden otherwise — most browsers won't show a
// custom install button at all (Safari/iOS has no install prompt
// API and instead relies on "Add to Home Screen" from the share
// sheet, which the note text in Settings covers instead).
// Depends on: nothing (safe to load standalone; only touches
// #pwaInstallField / #pwaInstallBtn if they exist in the DOM).
// ============================================================

let pwaDeferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Relative path so this still works if the app is ever served
    // from a subdirectory rather than domain root.
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the browser's default mini-infobar so the prompt only
  // ever appears when the user deliberately clicks our own button —
  // a study app popping up its own install nag unprompted would be
  // more annoying than helpful.
  e.preventDefault();
  pwaDeferredInstallPrompt = e;
  const field = document.getElementById('pwaInstallField');
  if (field) field.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  pwaDeferredInstallPrompt = null;
  const field = document.getElementById('pwaInstallField');
  if (field) field.style.display = 'none';
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('pwaInstallBtn');
  if (!installBtn) return;

  installBtn.addEventListener('click', async () => {
    if (!pwaDeferredInstallPrompt) return;
    pwaDeferredInstallPrompt.prompt();
    try {
      await pwaDeferredInstallPrompt.userChoice;
    } finally {
      // The prompt can only be used once — discard it either way, and
      // let a future beforeinstallprompt event (if any) supply a new one.
      pwaDeferredInstallPrompt = null;
      document.getElementById('pwaInstallField').style.display = 'none';
    }
  });

  // Hide the install row entirely if the app is already running as an
  // installed PWA (standalone display mode) — nothing to install.
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) {
    const field = document.getElementById('pwaInstallField');
    if (field) field.style.display = 'none';
  }
});
