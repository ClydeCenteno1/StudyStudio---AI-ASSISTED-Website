// ============================================================
// StudyStudio — Theme Picker
// Applies a [data-theme] value to <html>, persists it to
// localStorage (LS_THEME), and renders the swatch grid shown in
// Settings (#themeSwatchGrid). The actual color values for each
// theme live in css/themes.css — this file only needs to know the
// theme names/labels and a couple of preview colors per swatch.
// The <head> inline script in index.html reads LS_THEME directly
// (to avoid a flash of the wrong theme before scripts load) using
// the same theme list and default as here — keep them in sync.
// Depends on: config.js
// ============================================================

const THEMES = [
  {id: 'dark',   label: 'Dark',   swatch: ['#14181f', '#d8a438', '#4fa98c']},
  {id: 'light',  label: 'Light',  swatch: ['#f6f4ee', '#c8862a', '#2f8a6f']},
  {id: 'pink',   label: 'Pink',   swatch: ['#1f1620', '#e8759e', '#7dbfa8']},
  {id: 'red',    label: 'Red',    swatch: ['#1c1414', '#d9503f', '#4fa98c']},
  {id: 'forest', label: 'Forest', swatch: ['#131a16', '#7cb257', '#4fa98c']},
  {id: 'ocean',  label: 'Ocean',  swatch: ['#101820', '#4fb3d9', '#4fa98c']}
];

const DEFAULT_THEME = 'dark';

function getCurrentTheme() {
  const saved = localStorage.getItem(LS_THEME);
  return THEMES.some(t => t.id === saved) ? saved : DEFAULT_THEME;
}

function applyTheme(themeId) {
  const valid = THEMES.some(t => t.id === themeId) ? themeId : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', valid);
  try {
    localStorage.setItem(LS_THEME, valid);
  } catch (e) {
    console.error('Failed to save theme:', e);
  }
}

function renderThemeSwatches() {
  const grid = document.getElementById('themeSwatchGrid');
  if (!grid) return;

  const current = getCurrentTheme();
  grid.innerHTML = '';

  THEMES.forEach(theme => {
    const swatch = document.createElement('div');
    swatch.className = 'theme-swatch' + (theme.id === current ? ' active' : '');
    swatch.title = theme.label;

    const preview = document.createElement('div');
    preview.className = 'theme-swatch-preview';
    theme.swatch.forEach(color => {
      const span = document.createElement('span');
      span.style.background = color;
      preview.appendChild(span);
    });

    const label = document.createElement('div');
    label.className = 'theme-swatch-label';
    label.textContent = theme.label;

    swatch.appendChild(preview);
    swatch.appendChild(label);

    swatch.addEventListener('click', () => {
      applyTheme(theme.id);
      renderThemeSwatches();
    });

    grid.appendChild(swatch);
  });
}

// Apply the saved (or default) theme on load. The inline <head>
// script already set data-theme before first paint to avoid a
// flash; this just keeps document state consistent once the full
// script chain has loaded.
applyTheme(getCurrentTheme());
