
// ============================================================
// StudyStudio — Score History
// A flat append-only log of every graded quiz/exam attempt, so
// "am I improving?" can be answered from real data instead of
// only ever showing the most recent attempt.
//
// Each entry: {id, at (ISO), subject, subjectType, mode, right, total}
//   subjectType: 'deck' | 'topic'  (deck = flashcard-deck batchId,
//                topic = an ad-hoc Maker quiz/exam with no deck behind it)
//   subject:     the deck's batchId, or the Maker set's title string
//   mode:        'quiz' | 'exam'   (flip-mode "check answer" runs are
//                not logged — only quiz/exam have a clean score to log)
//
// Depends on: config.js
// Loaded after deck.js/maker.js define their result screens, before
// dashboard.js (dashboard shows a trend using this data) and before
// main.js.
// ============================================================

// Resolves a logged subject (a deck's stable batchId, or a Maker
// topic's title string) to what should be displayed right now. Deck
// names can change after the fact (rename), so deck-type entries look
// up the CURRENT name via deck.js's loadDeckNames() rather than
// trusting a stale snapshot; topic-type entries have no separate id
// to look up and just use the stored string as-is.
function resolveScoreSubjectLabel(subject, subjectType) {
  if (subjectType === 'deck') {
    try {
      const names = loadDeckNames();
      return names[subject] || 'Untitled Deck';
    } catch (e) {
      return subject; // deck.js not loaded yet — fall back to the raw id
    }
  }
  return subject;
}

function loadScoreHistory() {
  try { return JSON.parse(localStorage.getItem(LS_SCORE_HISTORY)) || []; }
  catch { return []; }
}
function saveScoreHistory(history) {
  safeSetItem(LS_SCORE_HISTORY, JSON.stringify(history));
}

// Records one graded attempt. Called from deck.js (quiz/exam finish)
// and maker.js (maker quiz/exam finish).
function logScoreAttempt({subject, subjectType, mode, right, total}) {
  if (!total) return; // nothing to log for an empty set
  const history = loadScoreHistory();
  history.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    subject: subject || 'Untitled',
    subjectType: subjectType || 'topic',
    mode: mode || 'quiz',
    right,
    total
  });
  // Cap growth — this is a trend log, not a permanent transcript. Keep
  // the most recent 500 attempts, which is generous for any real usage
  // pattern and avoids localStorage bloating unbounded over years of use.
  const trimmed = history.length > 500 ? history.slice(history.length - 500) : history;
  saveScoreHistory(trimmed);
  return trimmed;
}

// All attempts for one subject (a deck's batchId, or a Maker topic
// title), oldest first — the shape a small trend chart wants.
function getScoreHistoryForSubject(subject) {
  return loadScoreHistory()
    .filter(e => e.subject === subject)
    .sort((a, b) => a.at.localeCompare(b.at));
}

// Coarse "trending up / down / flat / new" signal across a subject's
// attempts, comparing the average of the most recent attempts against
// the ones before that. Used for a small dashboard/deck-view indicator
// rather than a full chart.
function getScoreTrend(subject) {
  const entries = getScoreHistoryForSubject(subject);
  if (entries.length === 0) return {trend: 'none', attempts: 0};
  if (entries.length === 1) {
    const pct = Math.round((entries[0].right / entries[0].total) * 100);
    return {trend: 'new', attempts: 1, latestPct: pct};
  }

  const pctOf = e => (e.right / e.total) * 100;
  const half = Math.max(1, Math.floor(entries.length / 2));
  const older = entries.slice(0, entries.length - half);
  const recent = entries.slice(entries.length - half);
  const avg = arr => arr.reduce((s, e) => s + pctOf(e), 0) / arr.length;

  const olderAvg = older.length ? avg(older) : avg(recent);
  const recentAvg = avg(recent);
  const latestPct = Math.round(pctOf(entries[entries.length - 1]));
  const diff = recentAvg - olderAvg;

  let trend = 'flat';
  if (diff >= 5) trend = 'up';
  else if (diff <= -5) trend = 'down';

  return {trend, attempts: entries.length, latestPct, diff: Math.round(diff)};
}

// Renders a compact inline sparkline + trend badge into a container
// element, for a given subject. Safe to call even with zero/one
// attempts (renders nothing or a minimal "first attempt" note).
function renderScoreTrendInto(container, subject) {
  if (!container) return;
  const entries = getScoreHistoryForSubject(subject);

  if (entries.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  if (entries.length === 1) {
    const pct = Math.round((entries[0].right / entries[0].total) * 100);
    container.innerHTML = `<span class="score-trend-badge new">First attempt: ${pct}%</span>`;
    return;
  }

  const pcts = entries.map(e => Math.round((e.right / e.total) * 100));
  const {trend, diff} = getScoreTrend(subject);
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendLabel = trend === 'up' ? `Improving (${diff > 0 ? '+' : ''}${diff}%)`
    : trend === 'down' ? `Slipping (${diff}%)`
    : 'Holding steady';

  // Tiny inline SVG sparkline — last up to 12 attempts, so a long
  // history doesn't squash into an unreadable line.
  const shown = pcts.slice(-12);
  const w = 90, h = 24, pad = 2;
  const stepX = shown.length > 1 ? (w - pad * 2) / (shown.length - 1) : 0;
  const points = shown.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (p / 100) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  container.innerHTML = `
    <svg class="score-sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
      <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <span class="score-trend-badge ${trend}">${trendIcon} ${escapeHtml(trendLabel)}</span>
  `;
}

// ---------- Score History view (list of every attempt, filterable) ----------
// A simple standalone panel showing every logged attempt, most recent
// first, grouped by subject. Opened from the Deck view toolbar and the
// Maker results screens ("View history" links) via openScoreHistory().
function renderScoreHistoryList(filterSubject) {
  const listEl = document.getElementById('scoreHistoryList');
  const emptyEl = document.getElementById('scoreHistoryEmpty');
  if (!listEl) return;

  const all = loadScoreHistory().slice().sort((a, b) => b.at.localeCompare(a.at));
  const rows = filterSubject ? all.filter(e => e.subject === filterSubject) : all;

  emptyEl.style.display = rows.length === 0 ? 'block' : 'none';
  listEl.innerHTML = '';

  rows.forEach(entry => {
    const pct = Math.round((entry.right / entry.total) * 100);
    const dateLabel = new Date(entry.at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
    const label = resolveScoreSubjectLabel(entry.subject, entry.subjectType);
    const row = document.createElement('div');
    row.className = 'score-history-row';
    row.innerHTML = `
      <div class="score-history-row-main">
        <span class="score-history-subject">${escapeHtml(label)}</span>
        <span class="score-history-mode">${entry.mode === 'exam' ? '📝 Exam' : '❓ Quiz'}</span>
      </div>
      <div class="score-history-row-side">
        <span class="score-history-pct ${pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low'}">${entry.right}/${entry.total} (${pct}%)</span>
        <span class="score-history-date mono">${dateLabel}</span>
      </div>
    `;
    listEl.appendChild(row);
  });
}

function openScoreHistory(filterSubject, filterSubjectType) {
  const overlay = document.getElementById('scoreHistoryOverlay');
  const titleEl = document.getElementById('scoreHistoryTitle');
  if (!overlay) return;
  const label = filterSubject ? resolveScoreSubjectLabel(filterSubject, filterSubjectType) : null;
  titleEl.textContent = label ? `History — ${label}` : 'Quiz & Exam History';
  overlay.dataset.filterSubject = filterSubject || '';
  renderScoreHistoryList(filterSubject || null);
  overlay.classList.add('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeScoreHistoryBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    document.getElementById('scoreHistoryOverlay').classList.remove('open');
  });
  const clearBtn = document.getElementById('scoreHistoryClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    const overlay = document.getElementById('scoreHistoryOverlay');
    const filterSubject = overlay.dataset.filterSubject || null;
    const msg = filterSubject
      ? `Clear all logged history for "${filterSubject}"?`
      : 'Clear ALL quiz/exam history? This cannot be undone.';
    if (!confirm(msg)) return;
    const remaining = filterSubject
      ? loadScoreHistory().filter(e => e.subject !== filterSubject)
      : [];
    saveScoreHistory(remaining);
    renderScoreHistoryList(filterSubject);
  });
});
