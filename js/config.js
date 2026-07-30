// ============================================================
// StudyStudio — Config
// Centralized localStorage keys and app-wide constants.
// Loaded first; every other script relies on these globals.
// ============================================================

const LS_CARDS = 'deckflip_cards';
const LS_DECK_NAMES = 'deckflip_deck_names';
const LS_PROVIDER = 'deckflip_provider';
const LS_GEMINI_KEY = 'deckflip_gemini_key';
const LS_GEMINI_MODEL = 'deckflip_gemini_model';
const LS_GROQ_KEY = 'deckflip_groq_key';
const LS_GROQ_MODEL = 'deckflip_groq_model';
const LS_REQUEST_LOG = 'deckflip_request_log';
const LS_GRADE_CACHE = 'deckflip_grade_cache';
const LS_THEME = 'deckflip_theme';
const LS_TUTOR_CHATS = 'tutorChats';
const LS_GWA_STATE = 'deckflip_gwa_state';

// Keys that make up a user's full local dataset. Used by the
// export/import backup feature in settings.js — keep this in sync
// whenever a new persisted feature is added.
const BACKUP_KEYS = [
  LS_CARDS,
  LS_DECK_NAMES,
  LS_PROVIDER,
  LS_GEMINI_KEY,
  LS_GEMINI_MODEL,
  LS_GROQ_KEY,
  LS_GROQ_MODEL,
  LS_GRADE_CACHE,
  LS_THEME,
  LS_TUTOR_CHATS,
  LS_GWA_STATE
  // Deliberately excludes LS_REQUEST_LOG (a daily quota counter,
  // not user data — importing a stale count would be misleading).
];
