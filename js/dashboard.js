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

function renderDashboard() {
  const strip = document.getElementById('dashboardStrip');
  if (!strip) return;

  const stats = [];

  // ---------- Cards due today (across all decks) ----------
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
