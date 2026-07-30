
// ============================================================
// StudyStudio — Dashboard Strip
// A glance-able summary shown at the top of the landing screen:
// cards due today, planner overdue/due-today count, deck count,
// note count, and GWA if one's been calculated. Pure aggregation
// of data every other module already stores — no new localStorage
// key, no new data model. Clicking a stat jumps straight to the
// relevant tab.
//
// Depends on: config.js, deck.js (loadCards, deckNames), srs.js
// (getDueCards), planner.js (loadPlannerTasks), notes.js (loadNotes)
// Loaded after all feature modules, before main.js.
// ============================================================

// ---------- Due Today widget ----------
// A standalone, per-deck breakdown of SRS-due cards with a one-click
// "Review now" per deck, plus a "Review all" that launches the same
// cross-deck '__due__' session the Deck tab's own banner uses. This
// is deliberately separate from the small stats strip below: due
// reviews are the single most actionable thing on the landing screen,
// so they get a prominent widget rather than being just one number
// among several.
function renderDueTodayWidget() {
  const widget = document.getElementById('dueTodayWidget');
  if (!widget) return;

  try {
    const allCards = loadCards();
    if (allCards.length === 0) { widget.style.display = 'none'; return; }

    const names = loadDeckNames();
    const dueCounts = getDueCountsByBatch(allCards); // {batchId: count}, only due>0 entries
    const batchIds = Object.keys(dueCounts).filter(id => dueCounts[id] > 0);

    if (batchIds.length === 0) { widget.style.display = 'none'; return; }

    // Sort busiest deck first — that's the one most worth tackling.
    batchIds.sort((a, b) => dueCounts[b] - dueCounts[a]);
    const totalDue = batchIds.reduce((sum, id) => sum + dueCounts[id], 0);

    document.getElementById('dueTodayHeadline').textContent =
      `${totalDue} ${totalDue === 1 ? 'card' : 'cards'} due today across ${batchIds.length} ${batchIds.length === 1 ? 'deck' : 'decks'}`;

    const decksEl = document.getElementById('dueTodayDecks');
    decksEl.innerHTML = batchIds.map(id => `
      <div class="due-today-deck-row">
        <div class="due-today-deck-name">${escapeHtml(names[id] || 'Untitled Deck')}</div>
        <div class="due-today-deck-right">
          <span class="due-today-deck-count">${dueCounts[id]} due</span>
          <button type="button" class="btn btn-ghost btn-sm" data-due-batch="${escapeHtml(id)}">Review</button>
        </div>
      </div>
    `).join('');

    decksEl.querySelectorAll('[data-due-batch]').forEach(btn => {
      btn.addEventListener('click', () => {
        const batchId = btn.dataset.dueBatch;
        switchToView(document.getElementById('deckView'));
        // startStudySession (deck.js) reads the live `cards`/`deckNames`
        // module state directly, so jumping straight into a per-deck
        // review here is safe without any extra deck-open step.
        startStudySession(batchId);
      });
    });

    widget.style.display = 'block';
  } catch (e) {
    // srs.js/deck.js not ready yet, or no due data — fail closed (hide).
    widget.style.display = 'none';
  }
}

document.getElementById('dueTodayReviewAllBtn')?.addEventListener('click', () => {
  switchToView(document.getElementById('deckView'));
  startStudySession('__due__');
});

function renderDashboard() {
  renderDueTodayWidget();

  const strip = document.getElementById('dashboardStrip');
  if (!strip) return;

  const stats = [];

  // ---------- Cards due today (across all decks) ----------
  // (The full per-deck breakdown now lives in the Due Today widget
  // above; this tile stays as a compact stat among the others when
  // there's nothing due, or as a quick-glance total when there is.)
  try {
    const allCards = loadCards();
    if (allCards.length > 0) {
      const due = getDueCards(allCards).length;
      stats.push({
        value: due,
        label: due === 1 ? 'card due today' : 'cards due today',
        warn: due > 0,
        onClick: () => switchToView(document.getElementById('deckView'))
      });
    }
  } catch (e) { /* deck.js/srs.js not ready — skip this stat */ }

  // ---------- Planner: overdue + due today ----------
  try {
    const tasks = loadPlannerTasks();
    const openTasks = tasks.filter(t => t.status !== 'done');
    if (openTasks.length > 0) {
      const todayISOStr = new Date().toISOString().slice(0, 10);
      const overdueCount = openTasks.filter(t => t.dueDate && t.dueDate < todayISOStr).length;
      const dueTodayCount = openTasks.filter(t => t.dueDate === todayISOStr).length;
      const urgentCount = overdueCount + dueTodayCount;

      stats.push({
        value: urgentCount > 0 ? urgentCount : openTasks.length,
        label: urgentCount > 0
          ? (overdueCount > 0 ? 'overdue task' + (overdueCount === 1 ? '' : 's') : 'task' + (dueTodayCount === 1 ? '' : 's') + ' due today')
          : 'open task' + (openTasks.length === 1 ? '' : 's'),
        warn: overdueCount > 0,
        onClick: () => switchToView(document.getElementById('plannerView'))
      });
    }
  } catch (e) { /* planner.js not ready — skip this stat */ }

  // ---------- Deck count ----------
  try {
    const allCards = loadCards();
    const names = loadDeckNames();
    const batchIds = new Set(allCards.map(c => c.batchId || 'default'));
    if (batchIds.size > 0) {
      stats.push({
        value: batchIds.size,
        label: batchIds.size === 1 ? 'flashcard deck' : 'flashcard decks',
        warn: false,
        onClick: () => switchToView(document.getElementById('deckView'))
      });
    }
  } catch (e) { /* deck.js not ready — skip this stat */ }

  // ---------- Notes count ----------
  try {
    const allNotes = loadNotes();
    if (allNotes.length > 0) {
      stats.push({
        value: allNotes.length,
        label: allNotes.length === 1 ? 'saved note' : 'saved notes',
        warn: false,
        onClick: () => switchToView(document.getElementById('notesView'))
      });
    }
  } catch (e) { /* notes.js not ready — skip this stat */ }

  // ---------- GWA (if a sheet was saved) ----------
  try {
    const saved = loadGwaState();
    if (saved && Array.isArray(saved.rows) && saved.rows.length) {
      // Re-derive the same weighted average gwa.js computes, without
      // touching the DOM (the GWA view may not be mounted/populated
      // right now) — mirrors calculateGwa()'s math exactly.
      let totalGradeUnits = 0;
      let totalUnits = 0;
      saved.rows.forEach(r => {
        const grade = parseFloat(r.grade);
        const units = parseFloat(r.units);
        if (isNaN(grade) || isNaN(units) || units <= 0) return;
        if (saved.excludeToggle && r.excluded) return;
        totalGradeUnits += grade * units;
        totalUnits += units;
      });
      if (totalUnits > 0) {
        const gwa = Math.round((totalGradeUnits / totalUnits) * 100) / 100;
        stats.push({
          value: gwa.toFixed(2),
          label: 'current GWA',
          warn: false,
          onClick: () => switchToView(document.getElementById('gwaView'))
        });
      }
    }
  } catch (e) { /* gwa.js not ready — skip this stat */ }

  // ---------- Watch sessions ----------
  try {
    const sessions = loadWatchSessions();
    if (sessions.length > 0) {
      stats.push({
        value: sessions.length,
        label: sessions.length === 1 ? 'watch session' : 'watch sessions',
        warn: false,
        onClick: () => switchToView(document.getElementById('watchView'))
      });
    }
  } catch (e) { /* watch.js not ready — skip this stat */ }

  if (stats.length === 0) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  strip.style.display = 'grid';
  strip.innerHTML = stats.map((s, i) => `
    <button type="button" class="dash-stat" data-dash-index="${i}">
      <div class="dash-stat-value${s.warn ? ' warn' : ''}">${escapeHtml(String(s.value))}</div>
      <div class="dash-stat-label">${escapeHtml(s.label)}</div>
    </button>
  `).join('');

  strip.querySelectorAll('.dash-stat').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      landingScreenGoBackHiddenBeforeNav();
      stats[i].onClick();
    });
  });
}

// switchToView() (defined in main.js) hides the landing screen itself
// as part of its own logic, so no extra hiding is needed here — this
// hook exists only in case a future stat needs pre-navigation cleanup.
function landingScreenGoBackHiddenBeforeNav() {}

// Re-render whenever the user returns to the landing screen, so a
// card studied or task completed in the last session is reflected
// immediately rather than only after a full page reload.
document.getElementById('backToMenuBtn').addEventListener('click', renderDashboard);

// Initial render on load.
renderDashboard();
