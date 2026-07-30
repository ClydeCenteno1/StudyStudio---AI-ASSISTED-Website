// ============================================================
// StudyStudio — Pomodoro Timer
// A small floating widget (bottom-right, draggable-free — just
// fixed position) with work/short-break/long-break cycling,
// customizable durations, and a soft chime on phase change.
// Persists remaining time + phase across reloads/tab switches so
// leaving the app mid-session doesn't reset the clock.
// Depends on: config.js
// ============================================================

const POMODORO_DEFAULTS = {
  work: 25,       // minutes
  shortBreak: 5,
  longBreak: 15,
  cyclesBeforeLongBreak: 4
};

let pomodoroState = loadPomodoroState();
let pomodoroInterval = null;

function loadPomodoroState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_POMODORO_STATE));
    if (saved && typeof saved.remainingSeconds === 'number') return saved;
  } catch {}
  return {
    phase: 'work',          // 'work' | 'shortBreak' | 'longBreak'
    remainingSeconds: POMODORO_DEFAULTS.work * 60,
    running: false,
    completedWorkCycles: 0,
    durations: {...POMODORO_DEFAULTS},
    soundOn: true
  };
}

function savePomodoroState() {
  try { localStorage.setItem(LS_POMODORO_STATE, JSON.stringify(pomodoroState)); }
  catch (e) { console.error('Failed to save pomodoro state:', e); }
}

const PHASE_LABELS = {
  work: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break'
};

function pomodoroPhaseSeconds(phase) {
  const mins = pomodoroState.durations[phase] ?? POMODORO_DEFAULTS[phase];
  return mins * 60;
}

// ---------- Rendering ----------
function renderPomodoro() {
  const widget = document.getElementById('pomodoroWidget');
  if (!widget) return;

  const mins = String(Math.floor(pomodoroState.remainingSeconds / 60)).padStart(2, '0');
  const secs = String(pomodoroState.remainingSeconds % 60).padStart(2, '0');

  document.getElementById('pomodoroTime').textContent = `${mins}:${secs}`;
  document.getElementById('pomodoroPhaseLabel').textContent = PHASE_LABELS[pomodoroState.phase];
  widget.dataset.phase = pomodoroState.phase;

  const playBtn = document.getElementById('pomodoroPlayPauseBtn');
  playBtn.textContent = pomodoroState.running ? '⏸' : '▶';
  playBtn.title = pomodoroState.running ? 'Pause' : 'Start';

  // Dots showing progress toward the next long break.
  const dotsEl = document.getElementById('pomodoroDots');
  dotsEl.innerHTML = '';
  const cyclesTarget = pomodoroState.durations.cyclesBeforeLongBreak || POMODORO_DEFAULTS.cyclesBeforeLongBreak;
  for (let i = 0; i < cyclesTarget; i++) {
    const dot = document.createElement('span');
    dot.className = 'pomodoro-dot' + (i < (pomodoroState.completedWorkCycles % cyclesTarget) ? ' filled' : '');
    dotsEl.appendChild(dot);
  }

  // Ring progress (visual only — CSS conic-gradient driven by a custom prop)
  const total = pomodoroPhaseSeconds(pomodoroState.phase);
  const pct = total > 0 ? Math.max(0, Math.min(1, 1 - pomodoroState.remainingSeconds / total)) : 0;
  document.getElementById('pomodoroRing').style.setProperty('--pomodoro-pct', pct);
}

// ---------- Controls ----------
function pomodoroTick() {
  if (pomodoroState.remainingSeconds > 0) {
    pomodoroState.remainingSeconds--;
    renderPomodoro();
    if (pomodoroState.remainingSeconds % 5 === 0) savePomodoroState();
  } else {
    advancePomodoroPhase();
  }
}

function advancePomodoroPhase() {
  playPomodoroChime();

  let nextPhase;
  if (pomodoroState.phase === 'work') {
    pomodoroState.completedWorkCycles++;
    const cyclesTarget = pomodoroState.durations.cyclesBeforeLongBreak || POMODORO_DEFAULTS.cyclesBeforeLongBreak;
    nextPhase = (pomodoroState.completedWorkCycles % cyclesTarget === 0) ? 'longBreak' : 'shortBreak';
  } else {
    nextPhase = 'work';
  }

  pomodoroState.phase = nextPhase;
  pomodoroState.remainingSeconds = pomodoroPhaseSeconds(nextPhase);
  // Auto-continue into the next phase rather than silently stopping —
  // a student who stepped away mid-break shouldn't come back to a
  // frozen "00:00" with no indication anything happened.
  savePomodoroState();
  renderPomodoro();
  notifyPomodoroPhaseChange(nextPhase);
}

function notifyPomodoroPhaseChange(nextPhase) {
  const banner = document.getElementById('pomodoroPhaseBanner');
  if (!banner) return;
  const msg = nextPhase === 'work'
    ? "Break's over — back to focus."
    : (nextPhase === 'longBreak' ? "Nice work — take a longer break." : "Time for a short break.");
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 4000);
}

function playPomodoroChime() {
  if (!pomodoroState.soundOn) return;
  try {
    // Two short tones via WebAudio — no external asset, so it works
    // fully offline and never triggers autoplay/network restrictions.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.3);
    });
  } catch (e) { /* WebAudio unsupported/blocked — fail silently */ }
}

function startPomodoro() {
  if (pomodoroInterval) return;
  pomodoroState.running = true;
  savePomodoroState();
  renderPomodoro();
  pomodoroInterval = setInterval(pomodoroTick, 1000);
}

function pausePomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroState.running = false;
  savePomodoroState();
  renderPomodoro();
}

function resetPomodoro() {
  pausePomodoro();
  pomodoroState.remainingSeconds = pomodoroPhaseSeconds(pomodoroState.phase);
  savePomodoroState();
  renderPomodoro();
}

function skipPomodoroPhase() {
  pausePomodoro();
  advancePomodoroPhase();
}

// ---------- Settings popover (durations + sound toggle) ----------
function openPomodoroSettings() {
  document.getElementById('pomodoroWorkMinsInput').value = pomodoroState.durations.work;
  document.getElementById('pomodoroShortBreakMinsInput').value = pomodoroState.durations.shortBreak;
  document.getElementById('pomodoroLongBreakMinsInput').value = pomodoroState.durations.longBreak;
  document.getElementById('pomodoroCyclesInput').value = pomodoroState.durations.cyclesBeforeLongBreak;
  document.getElementById('pomodoroSoundToggle').checked = pomodoroState.soundOn;
  document.getElementById('pomodoroSettingsPopover').classList.add('open');
}
function closePomodoroSettings() {
  document.getElementById('pomodoroSettingsPopover').classList.remove('open');
}
function savePomodoroSettings() {
  const clampMins = (val, fallback) => {
    const n = parseInt(val, 10);
    return (Number.isFinite(n) && n > 0) ? Math.min(180, n) : fallback;
  };

  pomodoroState.durations = {
    work: clampMins(document.getElementById('pomodoroWorkMinsInput').value, POMODORO_DEFAULTS.work),
    shortBreak: clampMins(document.getElementById('pomodoroShortBreakMinsInput').value, POMODORO_DEFAULTS.shortBreak),
    longBreak: clampMins(document.getElementById('pomodoroLongBreakMinsInput').value, POMODORO_DEFAULTS.longBreak),
    cyclesBeforeLongBreak: clampMins(document.getElementById('pomodoroCyclesInput').value, POMODORO_DEFAULTS.cyclesBeforeLongBreak)
  };
  pomodoroState.soundOn = document.getElementById('pomodoroSoundToggle').checked;

  // Only snap the visible countdown to the new duration if the timer
  // isn't currently mid-run for this phase — otherwise editing settings
  // mid-focus-session would yank time away that's already in progress.
  if (!pomodoroState.running) {
    pomodoroState.remainingSeconds = pomodoroPhaseSeconds(pomodoroState.phase);
  }

  savePomodoroState();
  renderPomodoro();
  closePomodoroSettings();
}

// ---------- Show/hide (minimize to a small pill) ----------
function togglePomodoroMinimized() {
  const widget = document.getElementById('pomodoroWidget');
  widget.classList.toggle('minimized');
  try { localStorage.setItem('deckflip_pomodoro_minimized', widget.classList.contains('minimized') ? '1' : '0'); }
  catch {}
}

// ---------- Wiring ----------
document.getElementById('pomodoroPlayPauseBtn').addEventListener('click', () => {
  if (pomodoroState.running) pausePomodoro(); else startPomodoro();
});
document.getElementById('pomodoroResetBtn').addEventListener('click', resetPomodoro);
document.getElementById('pomodoroSkipBtn').addEventListener('click', skipPomodoroPhase);
document.getElementById('pomodoroSettingsBtn').addEventListener('click', openPomodoroSettings);
document.getElementById('pomodoroSettingsCancelBtn').addEventListener('click', closePomodoroSettings);
document.getElementById('pomodoroSettingsSaveBtn').addEventListener('click', savePomodoroSettings);
document.getElementById('pomodoroMinimizeBtn').addEventListener('click', togglePomodoroMinimized);
document.getElementById('pomodoroExpandBtn').addEventListener('click', togglePomodoroMinimized);

// ---------- Init ----------
(function initPomodoro() {
  // Backfill durations/soundOn for state saved before those fields existed.
  if (!pomodoroState.durations) pomodoroState.durations = {...POMODORO_DEFAULTS};
  if (typeof pomodoroState.soundOn !== 'boolean') pomodoroState.soundOn = true;

  renderPomodoro();

  if (pomodoroState.running) {
    // Resume the interval on load (state itself already reflects
    // remaining time as of the last tick before reload/close).
    pomodoroInterval = setInterval(pomodoroTick, 1000);
  }

  try {
    if (localStorage.getItem('deckflip_pomodoro_minimized') === '1') {
      document.getElementById('pomodoroWidget').classList.add('minimized');
    }
  } catch {}
})();
