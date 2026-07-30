// ============================================================
// StudyStudio — Watch & Note
// Paste a YouTube link, watch it, and capture either timestamped
// text notes or freeform whiteboard sketches beside the player —
// without leaving the tab. Each "session" bundles one video URL +
// its notes + its whiteboard drawing, saved together so a video
// can be resumed later exactly where you left off.
//
// Depends on: config.js, utils.js (escapeHtml)
// Loaded after pomodoro.js, before settings.js/main.js.
// ============================================================

let watchSessions = loadWatchSessions();
let currentWatchId = null;
let watchPlayer = null;          // <iframe> element for the current video
let watchMode = 'notes';         // 'notes' | 'whiteboard'

// ---------- Storage ----------
function loadWatchSessions() {
  try { return JSON.parse(localStorage.getItem(LS_WATCH_SESSIONS)) || []; }
  catch { return []; }
}
function saveWatchSessions() {
  try { localStorage.setItem(LS_WATCH_SESSIONS, JSON.stringify(watchSessions)); }
  catch (e) { console.error('Failed to save watch sessions:', e); }
}

function getCurrentWatchSession() {
  let s = watchSessions.find(s => s.id === currentWatchId);
  if (!s) {
    s = watchSessions[0];
    currentWatchId = s ? s.id : null;
  }
  return s;
}

function createWatchSession() {
  const session = {
    id: crypto.randomUUID(),
    title: 'New session',
    url: '',
    videoId: null,
    notes: [],          // [{id, seconds, text}]
    whiteboardData: null, // data URL PNG, or null
    updatedAt: new Date().toISOString()
  };
  watchSessions.unshift(session);
  currentWatchId = session.id;
  saveWatchSessions();
  renderWatchSessionList();
  loadWatchSessionIntoEditor(session.id);
  document.getElementById('watchUrlInput').focus();
  return session;
}

function deleteWatchSession(sessionId) {
  const session = watchSessions.find(s => s.id === sessionId);
  if (!session) return;
  if (!confirm(`Delete "${session.title || 'this session'}"? This can't be undone.`)) return;

  watchSessions = watchSessions.filter(s => s.id !== sessionId);
  saveWatchSessions();

  if (currentWatchId === sessionId) {
    currentWatchId = watchSessions.length ? watchSessions[0].id : null;
  }
  renderWatchSessionList();
  if (currentWatchId) {
    loadWatchSessionIntoEditor(currentWatchId);
  } else {
    showWatchEmptyEditor();
  }
}

// ---------- YouTube URL parsing ----------
// Accepts youtube.com/watch?v=, youtu.be/, youtube.com/embed/,
// youtube.com/shorts/, with or without extra query params.
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?.*?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// ---------- List rendering ----------
function renderWatchSessionList() {
  const listEl = document.getElementById('watchSessionList');
  const emptyEl = document.getElementById('watchSessionListEmpty');
  if (!listEl) return;

  listEl.innerHTML = '';
  emptyEl.style.display = watchSessions.length === 0 ? 'block' : 'none';

  const sorted = [...watchSessions].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  sorted.forEach(session => {
    const item = document.createElement('div');
    item.className = 'note-list-item' + (session.id === currentWatchId ? ' active' : '');

    const noteCount = (session.notes || []).length;
    const updatedLabel = session.updatedAt
      ? new Date(session.updatedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
      : '';

    item.innerHTML = `
      <div class="note-list-item-top">
        <span class="note-list-item-title">${escapeHtml(session.title || 'New session')}</span>
        <button class="icon-btn note-list-item-del" title="Delete session">✕</button>
      </div>
      <div class="note-list-item-preview">${noteCount} note${noteCount === 1 ? '' : 's'}${session.whiteboardData ? ' · has sketch' : ''}</div>
      <div class="note-list-item-date mono">${updatedLabel}</div>
    `;

    item.querySelector('.note-list-item-title').parentElement.addEventListener('click', (e) => {
      if (e.target.closest('.note-list-item-del')) return;
      currentWatchId = session.id;
      loadWatchSessionIntoEditor(session.id);
      renderWatchSessionList();
      closeWatchSidebar();
    });

    item.querySelector('.note-list-item-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWatchSession(session.id);
    });

    listEl.appendChild(item);
  });
}

// ---------- Editor ----------
function showWatchEmptyEditor() {
  document.getElementById('watchEditorEmpty').style.display = 'flex';
  document.getElementById('watchEditorMain').style.display = 'none';
}

function loadWatchSessionIntoEditor(sessionId) {
  const session = watchSessions.find(s => s.id === sessionId);
  if (!session) { showWatchEmptyEditor(); return; }

  document.getElementById('watchEditorEmpty').style.display = 'none';
  document.getElementById('watchEditorMain').style.display = 'flex';

  document.getElementById('watchUrlInput').value = session.url || '';
  updateWatchSavedStamp(session.updatedAt);

  if (session.videoId) {
    mountWatchPlayer(session.videoId);
  } else {
    unmountWatchPlayer();
  }

  renderWatchNotesList();
  setWatchMode('notes');
  loadWhiteboardForSession(session);
}

function updateWatchSavedStamp(isoString) {
  const stampEl = document.getElementById('watchSavedStamp');
  if (!stampEl) return;
  if (!isoString) { stampEl.textContent = ''; return; }
  const d = new Date(isoString);
  stampEl.textContent = `Saved ${d.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})}`;
}

function touchCurrentWatchSession() {
  const session = getCurrentWatchSession();
  if (!session) return;
  session.updatedAt = new Date().toISOString();
  saveWatchSessions();
  updateWatchSavedStamp(session.updatedAt);
  renderWatchSessionList();
}

// ---------- Loading a URL ----------
function loadWatchUrl() {
  const session = getCurrentWatchSession();
  if (!session) return;

  const url = document.getElementById('watchUrlInput').value.trim();
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    alert("That doesn't look like a YouTube link. Try a URL like https://youtube.com/watch?v=... or https://youtu.be/...");
    return;
  }

  session.url = url;
  session.videoId = videoId;
  if (session.title === 'New session') {
    session.title = url;
  }
  touchCurrentWatchSession();
  mountWatchPlayer(videoId);
}

document.getElementById('watchUrlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); loadWatchUrl(); }
});
document.getElementById('watchLoadUrlBtn').addEventListener('click', loadWatchUrl);

// ---------- YouTube Player (plain iframe + postMessage) ----------
// Deliberately NOT using the YT.Player JS constructor here — that
// path validates the page's origin against the video's embed
// permissions and throws Error 153 in sandboxed/proxied environments
// (previews, some browser extensions, file:// contexts, etc.) even
// for videos that embed fine everywhere else. A plain <iframe src="
// .../embed/VIDEO_ID?enablejsapi=1"> with postMessage control is far
// more robust and is exactly what YT.Player does under the hood
// anyway — this just skips the part that's failing.
let watchIframeReady = false;

function mountWatchPlayer(videoId) {
  document.getElementById('watchVideoPlaceholder').style.display = 'none';
  document.getElementById('watchPlayerMount').style.display = 'block';

  const mount = document.getElementById('watchPlayerMount');
  watchIframeReady = false;

  const origin = encodeURIComponent(window.location.origin);
  mount.innerHTML = `<iframe id="watchYtIframe"
    src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&origin=${origin}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>`;

  watchPlayer = document.getElementById('watchYtIframe');
}

function unmountWatchPlayer() {
  document.getElementById('watchVideoPlaceholder').style.display = 'flex';
  document.getElementById('watchPlayerMount').style.display = 'none';
  document.getElementById('watchPlayerMount').innerHTML = '';
  watchPlayer = null;
  watchIframeReady = false;
}

// Sends a command to the embedded player via postMessage, per
// YouTube's IFrame Player API message protocol.
function postToWatchPlayer(func, args) {
  if (!watchPlayer || !watchPlayer.contentWindow) return;
  try {
    watchPlayer.contentWindow.postMessage(JSON.stringify({
      event: 'command',
      func,
      args: args || []
    }), '*');
  } catch (e) { /* iframe not ready yet — safe to ignore */ }
}

// Listens for the player's state/time broadcasts. YouTube's embed
// only pushes this data if we first ask it to (via 'listening'
// handshake below); we keep the latest known time in memory so
// getWatchCurrentSeconds() has something to read synchronously.
let watchLastKnownSeconds = null;

window.addEventListener('message', (e) => {
  if (!watchPlayer || e.source !== watchPlayer.contentWindow) return;
  let data;
  try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; }
  catch { return; }

  if (data.event === 'infoDelivery' && data.info && typeof data.info.currentTime === 'number') {
    watchLastKnownSeconds = Math.floor(data.info.currentTime);
  }
  if (data.event === 'onReady' || data.event === 'onStateChange') {
    watchIframeReady = true;
    // Ask the player to keep sending time updates.
    postToWatchPlayer('addEventListener', ['onStateChange']);
  }
});

// Polls the player for its current time every second while a video
// is loaded, since infoDelivery events don't fire reliably on their
// own without active playback.
setInterval(() => {
  if (watchPlayer) postToWatchPlayer('getCurrentTime');
}, 1000);

// Returns the current playback time in whole seconds, or null if no
// player is active yet / no time has been reported.
function getWatchCurrentSeconds() {
  return watchPlayer ? watchLastKnownSeconds : null;
}

function formatWatchTimestamp(seconds) {
  if (seconds === null || seconds === undefined) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

function seekWatchTo(seconds) {
  postToWatchPlayer('seekTo', [seconds, true]);
  postToWatchPlayer('playVideo');
}

// ---------- Notes mode ----------
function insertWatchTimestamp() {
  const seconds = getWatchCurrentSeconds();
  const input = document.getElementById('watchNoteInput');
  const stamp = seconds === null ? '[no video loaded] ' : `[${formatWatchTimestamp(seconds)}] `;
  input.value = stamp + input.value;
  input.dataset.pendingSeconds = seconds === null ? '' : String(seconds);
  input.focus();
}

function addWatchNote() {
  const session = getCurrentWatchSession();
  if (!session) return;

  const input = document.getElementById('watchNoteInput');
  const text = input.value.trim();
  if (!text) return;

  const pendingSeconds = input.dataset.pendingSeconds;
  const seconds = pendingSeconds !== '' && pendingSeconds !== undefined
    ? Number(pendingSeconds)
    : getWatchCurrentSeconds();

  session.notes = session.notes || [];
  session.notes.push({
    id: crypto.randomUUID(),
    seconds,
    text
  });

  input.value = '';
  input.dataset.pendingSeconds = '';

  touchCurrentWatchSession();
  renderWatchNotesList();
}

function deleteWatchNote(noteId) {
  const session = getCurrentWatchSession();
  if (!session) return;
  session.notes = (session.notes || []).filter(n => n.id !== noteId);
  touchCurrentWatchSession();
  renderWatchNotesList();
}

function renderWatchNotesList() {
  const listEl = document.getElementById('watchNotesList');
  const emptyEl = document.getElementById('watchNotesEmpty');
  const session = getCurrentWatchSession();
  const notes = (session && session.notes) || [];

  listEl.innerHTML = '';
  emptyEl.style.display = notes.length === 0 ? 'block' : 'none';

  notes.forEach(note => {
    const row = document.createElement('div');
    row.className = 'watch-note-item';

    const hasTimestamp = note.seconds !== null && note.seconds !== undefined;
    row.innerHTML = `
      ${hasTimestamp ? `<button class="watch-note-timestamp mono" title="Jump to this moment">${formatWatchTimestamp(note.seconds)}</button>` : ''}
      <div class="watch-note-text">${escapeHtml(note.text)}</div>
      <button class="icon-btn watch-note-del" title="Delete note">✕</button>
    `;

    if (hasTimestamp) {
      row.querySelector('.watch-note-timestamp').addEventListener('click', () => seekWatchTo(note.seconds));
    }
    row.querySelector('.watch-note-del').addEventListener('click', () => deleteWatchNote(note.id));

    listEl.appendChild(row);
  });
}

document.getElementById('watchStampBtn').addEventListener('click', insertWatchTimestamp);
document.getElementById('watchAddNoteBtn').addEventListener('click', addWatchNote);
document.getElementById('watchNoteInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addWatchNote(); }
});

// ---------- Mode toggle (Notes / Whiteboard) ----------
function setWatchMode(mode) {
  watchMode = mode;
  document.querySelectorAll('#watchModeGroup .pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.watchmode === mode);
  });
  document.getElementById('watchNotesMode').style.display = mode === 'notes' ? 'flex' : 'none';
  document.getElementById('watchWhiteboardMode').style.display = mode === 'whiteboard' ? 'flex' : 'none';

  if (mode === 'whiteboard') {
    // Canvas needs its backing size set after it's actually visible and
    // laid out — doing this while display:none would size it 0x0.
    requestAnimationFrame(() => {
      resizeWhiteboardCanvas();
      const session = getCurrentWatchSession();
      if (session) loadWhiteboardForSession(session);
    });
  }
}

document.querySelectorAll('#watchModeGroup .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => setWatchMode(btn.dataset.watchmode));
});

// ---------- Whiteboard ----------
const WATCH_WB_COLORS = ['#232323', '#c1594b', '#2f8a6f', '#4fb3d9', '#d8a438'];
let watchWbColor = WATCH_WB_COLORS[0];
let watchWbErasing = false;
let watchWbDrawing = false;
let watchWbLastPoint = null;
let watchWbSaveTimer = null;

function renderWatchWbColorSwatches() {
  const wrap = document.getElementById('watchWbColors');
  wrap.innerHTML = '';
  WATCH_WB_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'watch-wb-color' + (color === watchWbColor && !watchWbErasing ? ' active' : '');
    btn.style.background = color;
    btn.title = 'Draw';
    btn.addEventListener('click', () => {
      watchWbColor = color;
      watchWbErasing = false;
      renderWatchWbColorSwatches();
    });
    wrap.appendChild(btn);
  });
}

function getWhiteboardCanvas() {
  return document.getElementById('watchWhiteboardCanvas');
}

function resizeWhiteboardCanvas() {
  const canvas = getWhiteboardCanvas();
  if (!canvas || canvas.offsetWidth === 0) return;

  // Preserve existing drawing across a resize by snapshotting first,
  // then restoring it scaled onto the newly-sized backing bitmap —
  // otherwise switching modes or resizing the window would wipe it.
  const prevDataUrl = (canvas.width && canvas.height) ? canvas.toDataURL() : null;

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fdfdfb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (prevDataUrl) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = prevDataUrl;
  }
}

function loadWhiteboardForSession(session) {
  const canvas = getWhiteboardCanvas();
  if (!canvas) return;
  if (canvas.width === 0 || canvas.height === 0) return; // not visible/sized yet

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fdfdfb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (session && session.whiteboardData) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = session.whiteboardData;
  }
}

function getWatchPointerPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: (point.clientX - rect.left) * (canvas.width / rect.width),
    y: (point.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function watchWbPointerDown(e) {
  e.preventDefault();
  const canvas = getWhiteboardCanvas();
  watchWbDrawing = true;
  watchWbLastPoint = getWatchPointerPos(e, canvas);
}

function watchWbPointerMove(e) {
  if (!watchWbDrawing) return;
  e.preventDefault();
  const canvas = getWhiteboardCanvas();
  const ctx = canvas.getContext('2d');
  const point = getWatchPointerPos(e, canvas);

  ctx.beginPath();
  ctx.moveTo(watchWbLastPoint.x, watchWbLastPoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = watchWbErasing ? 22 : 2.5;
  ctx.strokeStyle = watchWbErasing ? '#fdfdfb' : watchWbColor;
  ctx.stroke();

  watchWbLastPoint = point;
  scheduleWhiteboardAutosave();
}

function watchWbPointerUp() {
  watchWbDrawing = false;
  watchWbLastPoint = null;
}

function scheduleWhiteboardAutosave() {
  clearTimeout(watchWbSaveTimer);
  watchWbSaveTimer = setTimeout(saveWhiteboardToSession, 600);
}

function saveWhiteboardToSession() {
  const session = getCurrentWatchSession();
  const canvas = getWhiteboardCanvas();
  if (!session || !canvas || canvas.width === 0) return;
  session.whiteboardData = canvas.toDataURL('image/png');
  touchCurrentWatchSession();
}

function clearWhiteboard() {
  if (!confirm('Clear the whiteboard for this session?')) return;
  const canvas = getWhiteboardCanvas();
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fdfdfb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveWhiteboardToSession();
}

document.getElementById('watchWbEraserBtn').addEventListener('click', () => {
  watchWbErasing = true;
  renderWatchWbColorSwatches();
});
document.getElementById('watchWbClearBtn').addEventListener('click', clearWhiteboard);

(function wireWhiteboardCanvas() {
  const canvas = getWhiteboardCanvas();
  canvas.addEventListener('mousedown', watchWbPointerDown);
  canvas.addEventListener('mousemove', watchWbPointerMove);
  window.addEventListener('mouseup', watchWbPointerUp);
  canvas.addEventListener('touchstart', watchWbPointerDown, {passive: false});
  canvas.addEventListener('touchmove', watchWbPointerMove, {passive: false});
  canvas.addEventListener('touchend', watchWbPointerUp);
})();

window.addEventListener('resize', () => {
  if (watchMode === 'whiteboard') resizeWhiteboardCanvas();
});

// ---------- Delete session button (in toolbar) ----------
document.getElementById('watchDeleteBtn').addEventListener('click', () => {
  if (currentWatchId) deleteWatchSession(currentWatchId);
});

// ---------- New session button ----------
document.getElementById('newWatchSessionBtn').addEventListener('click', createWatchSession);

// ---------- Mobile: sessions list becomes a slide-out drawer ----------
const watchSidebarEl = document.getElementById('watchSidebar');
const watchSidebarScrimEl = document.getElementById('watchSidebarScrim');

function openWatchSidebar() {
  watchSidebarEl.classList.add('open');
  watchSidebarScrimEl.classList.add('open');
}
function closeWatchSidebar() {
  watchSidebarEl.classList.remove('open');
  watchSidebarScrimEl.classList.remove('open');
}
document.getElementById('watchSidebarToggleBtn').addEventListener('click', openWatchSidebar);
watchSidebarScrimEl.addEventListener('click', closeWatchSidebar);

// ---------- Init ----------
renderWatchWbColorSwatches();
renderWatchSessionList();
if (watchSessions.length) {
  currentWatchId = watchSessions[0].id;
  loadWatchSessionIntoEditor(currentWatchId);
} else {
  showWatchEmptyEditor();
}
