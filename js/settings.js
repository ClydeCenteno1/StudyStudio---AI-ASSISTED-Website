// ============================================================
// StudyStudio — Settings
// AI provider/key/model settings, plus data backup (export/import)
// and the theme picker's home in the Settings modal.
// Depends on: config.js, api.js, themes.js
// ============================================================

const settingsOverlay = document.getElementById('settingsOverlay');
const providerSelect = document.getElementById('providerSelect');
const geminiFields = document.getElementById('geminiFields');
const groqFields = document.getElementById('groqFields');

function updateSettingsFieldVisibility() {
  const isGroq = providerSelect.value === 'groq';
  geminiFields.style.display = isGroq ? 'none' : 'block';
  groqFields.style.display = isGroq ? 'block' : 'none';
}
providerSelect.addEventListener('change', updateSettingsFieldVisibility);

function openSettings() {
  providerSelect.value = getProvider();
  document.getElementById('apiKeyInputGemini').value = localStorage.getItem(LS_GEMINI_KEY) || '';
  document.getElementById('geminiModelSelect').value = localStorage.getItem(LS_GEMINI_MODEL) || 'gemini-3.6-flash';
  document.getElementById('apiKeyInputGroq').value = localStorage.getItem(LS_GROQ_KEY) || '';
  document.getElementById('groqModelSelect').value = localStorage.getItem(LS_GROQ_MODEL) || 'openai/gpt-oss-120b';
  updateSettingsFieldVisibility();
  const remaining = getRemainingGeminiRequests();
  const quotaNote = document.getElementById('geminiQuotaNote');
  quotaNote.textContent = `${remaining} / ${GEMINI_FREE_DAILY_LIMIT} free requests left today (resets at midnight, your device's clock).`;
  quotaNote.style.color = remaining <= 5 ? 'var(--danger)' : 'var(--ink-soft)';
  renderThemeSwatches();
  refreshBackupNote();
  settingsOverlay.classList.add('open');
}

document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsCancelBtn').addEventListener('click', () => settingsOverlay.classList.remove('open'));

document.getElementById('settingsSaveBtn').addEventListener('click', () => {
  localStorage.setItem(LS_PROVIDER, providerSelect.value);
  localStorage.setItem(LS_GEMINI_KEY, document.getElementById('apiKeyInputGemini').value.trim());
  localStorage.setItem(LS_GEMINI_MODEL, document.getElementById('geminiModelSelect').value);
  localStorage.setItem(LS_GROQ_KEY, document.getElementById('apiKeyInputGroq').value.trim());
  localStorage.setItem(LS_GROQ_MODEL, document.getElementById('groqModelSelect').value);
  settingsOverlay.classList.remove('open');
});

// ============================================================
// Data Backup — Export / Import
// Everything lives in localStorage with no server backend, so
// clearing site data / switching browsers / a corrupted profile
// means total loss of decks, tutor chats, GWA sheets, and the
// saved API key. This lets a user pull all of it into one JSON
// file and restore it later, on this device or another.
// ============================================================

const BACKUP_FORMAT_VERSION = 1;

function refreshBackupNote() {
  const note = document.getElementById('backupNote');
  if (!note) return;
  const cardCount = loadCards().length;
  const chatCount = (() => {
    try { return (JSON.parse(localStorage.getItem(LS_TUTOR_CHATS)) || []).length; }
    catch { return 0; }
  })();
  note.textContent = `Currently stored: ${cardCount} card(s), ${chatCount} tutor conversation(s). Export includes your API key(s) — keep the file private.`;
}

function exportBackupData() {
  const payload = {
    _format: 'studystudio-backup',
    _version: BACKUP_FORMAT_VERSION,
    _exportedAt: new Date().toISOString(),
    data: {}
  };
  BACKUP_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (val !== null) payload.data[key] = val;
  });

  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `studystudio-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackupData(file) {
  const statusEl = document.getElementById('backupImportStatus');
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--danger)' : 'var(--teal)';
  };

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      setStatus('That file isn\'t valid JSON — import cancelled.', true);
      return;
    }

    if (!parsed || parsed._format !== 'studystudio-backup' || !parsed.data) {
      setStatus('That doesn\'t look like a StudyStudio backup file — import cancelled.', true);
      return;
    }

    const keysFound = Object.keys(parsed.data).filter(k => BACKUP_KEYS.includes(k));
    if (keysFound.length === 0) {
      setStatus('Backup file has no recognizable data — nothing imported.', true);
      return;
    }

    const proceed = confirm(
      `This will overwrite your current decks, tutor chats, GWA sheet, theme, and saved API key(s) ` +
      `with the contents of this backup (from ${parsed._exportedAt ? new Date(parsed._exportedAt).toLocaleString() : 'unknown date'}). ` +
      `This can't be undone. Continue?`
    );
    if (!proceed) {
      setStatus('Import cancelled.', false);
      return;
    }

    keysFound.forEach(key => {
      try {
        localStorage.setItem(key, parsed.data[key]);
      } catch (e) {
        console.error(`Failed to restore key ${key}:`, e);
      }
    });

    setStatus('Import complete — reloading…', false);
    setTimeout(() => window.location.reload(), 700);
  };
  reader.onerror = () => setStatus('Could not read that file — import cancelled.', true);
  reader.readAsText(file);
}

const backupExportBtn = document.getElementById('backupExportBtn');
const backupImportBtn = document.getElementById('backupImportBtn');
const backupImportInput = document.getElementById('backupImportInput');

if (backupExportBtn) backupExportBtn.addEventListener('click', exportBackupData);
if (backupImportBtn && backupImportInput) {
  backupImportBtn.addEventListener('click', () => backupImportInput.click());
  backupImportInput.addEventListener('change', () => {
    const file = backupImportInput.files && backupImportInput.files[0];
    if (file) importBackupData(file);
    backupImportInput.value = '';
  });
}
