
// ============================================================
// StudyStudio — Spaced Repetition (SM-2)
// Per-card scheduling state (ease factor, interval, due date,
// reps) stored separately from the cards themselves (LS_SRS_STATE),
// keyed by card id — so this bolts onto the existing deck/quiz/exam
// engines without changing the card data model at all.
//
// Rating scale (matches Anki-style SRS convention):
//   0 = Again   (forgot / wrong)      -> resets to a short interval
//   1 = Hard    (recalled, struggled) -> smaller growth
//   2 = Good    (recalled normally)   -> standard growth
//   3 = Easy    (recalled easily)     -> bigger growth
//
// Depends on: config.js
// Loaded before deck.js so deck.js can call rateCard() /
// getDueCards() / isCardDue() while wiring up its own UI.
// ============================================================

function loadSrsState() {
  try { return JSON.parse(localStorage.getItem(LS_SRS_STATE)) || {}; }
  catch { return {}; }
}
function saveSrsState(state) {
  safeSetItem(LS_SRS_STATE, JSON.stringify(state));
}

let srsState = loadSrsState();

// Returns a fresh scheduling record for a card that's never been
// rated yet. interval is in days; dueAt is an ISO date string (day
// granularity — reviews are a per-day thing, not per-minute).
function newSrsRecord() {
  return {
    ease: 2.5,       // SM-2 default ease factor
    interval: 0,      // days until next review (0 = due immediately / new)
    reps: 0,          // consecutive correct reps (resets on "Again")
    dueAt: todayISO(),
    lastRating: null,
    lastReviewedAt: null
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function getSrsRecord(cardId) {
  return srsState[cardId] || newSrsRecord();
}

// Core SM-2 step. Given the card's current record and a 0-3 rating,
// returns the next record. Deliberately simplified vs. textbook SM-2
// (no sub-day learning steps) since this app's review cadence is
// "once a day, at most," not a minute-by-minute Anki clone.
function nextSrsRecord(record, rating) {
  const r = {...record};

  if (rating === 0) {
    // Again: forgot it. Reset progress, see it again very soon, and
    // nudge ease down slightly so it doesn't grow as fast next time.
    r.reps = 0;
    r.interval = 0; // due again today/tomorrow, not weeks out
    r.ease = Math.max(1.3, r.ease - 0.2);
    r.dueAt = addDaysISO(0); // due immediately (shows up again today)
  } else {
    // Recalled it (Hard/Good/Easy) — grow the interval.
    r.reps += 1;

    if (rating === 1) r.ease = Math.max(1.3, r.ease - 0.15); // Hard
    else if (rating === 3) r.ease = r.ease + 0.15;            // Easy
    // Good (2): ease unchanged

    let nextInterval;
    if (r.reps === 1) {
      nextInterval = rating === 1 ? 1 : (rating === 3 ? 3 : 1);
    } else if (r.reps === 2) {
      nextInterval = rating === 1 ? 3 : (rating === 3 ? 8 : 6);
    } else {
      const base = r.interval > 0 ? r.interval : 1;
      nextInterval = base * r.ease;
      if (rating === 1) nextInterval *= 0.7;   // Hard grows slower
      if (rating === 3) nextInterval *= 1.3;   // Easy grows faster
    }

    // Cap so a single "Easy" streak doesn't push a card out a full
    // year on day 3 — keeps reviews from vanishing indefinitely.
    nextInterval = Math.min(180, Math.max(1, nextInterval));

    r.interval = nextInterval;
    r.dueAt = addDaysISO(nextInterval);
  }

  r.lastRating = rating;
  r.lastReviewedAt = todayISO();
  return r;
}

// Records a rating for a card and persists the updated schedule.
// Call this from study/quiz/exam flows whenever a card gets a
// right/wrong/self-graded outcome.
function rateCard(cardId, rating) {
  const current = getSrsRecord(cardId);
  const updated = nextSrsRecord(current, rating);
  srsState[cardId] = updated;
  saveSrsState(srsState);
  return updated;
}

// Convenience for automatic (AI-graded) right/wrong signals, where
// there's no Hard/Easy granularity to capture — maps to Again/Good.
function rateCardCorrectness(cardId, isCorrect) {
  return rateCard(cardId, isCorrect ? 2 : 0);
}

function isCardDue(cardId) {
  const record = srsState[cardId];
  if (!record) return true; // never studied = due now
  return record.dueAt <= todayISO();
}

// Filters a list of cards (as used by deck.js) down to the ones due
// today or overdue. Cards with no SRS record yet count as due (a
// student's first pass through a fresh deck should surface everything).
function getDueCards(cardList) {
  return cardList.filter(c => isCardDue(c.id));
}

// Cross-deck count for the "N due today" stamp shown on the deck
// folders screen — counts by batch so each folder card can show its
// own due count too.
function getDueCountsByBatch(cardList) {
  const counts = {};
  cardList.forEach(c => {
    const b = c.batchId || 'default';
    if (isCardDue(c.id)) counts[b] = (counts[b] || 0) + 1;
  });
  return counts;
}

// Cleans up SRS records for cards that no longer exist (deck/card
// deleted). Call after any deletion that removes cards from `cards`.
function pruneSrsState(cardList) {
  const validIds = new Set(cardList.map(c => c.id));
  let changed = false;
  Object.keys(srsState).forEach(id => {
    if (!validIds.has(id)) { delete srsState[id]; changed = true; }
  });
  if (changed) saveSrsState(srsState);
}
