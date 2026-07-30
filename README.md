# StudyStudio

An all-in-one AI study companion for students: turn notes into flashcards, generate mock quizzes and exams, get Socratic-style tutoring, track deadlines, and calculate your GWA — all running client-side, with your own AI API key.

StudyStudio is a static site with no backend. Everything you create is stored locally in your browser, and AI requests go directly from your browser to your chosen provider (Google or Groq). Nothing passes through a StudyStudio server.

## Features

- **⚡ Flashcards** — Paste your notes and get a full deck of flashcards. Study, flip, and self-check with AI grading.
- **🔁 Spaced Repetition** — Every flashcard is scheduled with an SM-2-based algorithm. A **Due Today** widget on the landing screen shows exactly what needs review, broken down by deck, with one-click "Review" per deck or a "Review all" across every deck at once.
- **📝 Mock Quiz & Exam Maker** — Give a topic, upload notes/photos/PDFs, and choose your question types. Get a custom quiz or timed exam, complete with hints.
- **🏛️ Socratic Tutor** — Stuck on a problem? Talk it through step-by-step with a tutor that asks guiding questions instead of just giving answers. Supports image uploads and LaTeX math rendering.
- **📊 Score History** — Every graded quiz and exam attempt is logged, so you can see trend lines per deck or topic instead of only your most recent score.
- **🗒️ Notes** — A lightweight Markdown + LaTeX note editor with live preview. Turn any note straight into a flashcard deck in one click.
- **🗓️ Schedule Planner** — Track exams, homework, and projects on a simple To Do / In Progress / Done board, with overdue and due-soon items called out at a glance.
- **⏱️ Pomodoro Timer** — A small floating work/break timer that persists across reloads, so leaving mid-session doesn't reset the clock.
- **▶️ Watch & Note** — Paste a YouTube link and take timestamped notes or sketch on a whiteboard right beside the video, without switching tabs.
- **🎓 GWA Calculator** — Compute your Philippine General Weighted Average (1.00–5.00 scale) — add each subject's grade and units, with optional subject exclusion.
- **⬇️ Deck Export** — Export any deck to CSV or Anki-importable plain text.
- **🎨 Theming** — Six built-in color themes (Dark, Light, Pink, Red, Forest, Ocean).
- **💾 Backup & Restore** — Export your full local dataset to a JSON file and import it back on any device, with an in-app storage usage indicator so you can see how close you are to your browser's local storage limit.
- **↩️ Undo Everywhere** — Deleting a note, deck, flashcard, or planner task is instant but reversible: a brief "Undo" toast appears instead of a blocking confirmation dialog.
- **📱 Installable (PWA)** — Add StudyStudio to your home screen for offline access to your saved content.

## Getting Started

StudyStudio is a static site — no build step, no server required.

1. Clone or download this repository.
2. Open `index.html` in a browser, or serve the folder with any static file server:
   ```bash
   python3 -m http.server 8000
   ```
3. On first launch, open **Settings** (top right) and add an API key for one of the supported providers.

## AI Providers

StudyStudio brings your own key — no data or usage passes through a StudyStudio server.

| Provider | Models | Notes |
|---|---|---|
| **Google Gemini** | Gemini 3.6 Flash | Free tier, capped at a daily request quota (shown live in Settings). |
| **Groq** | GPT-OSS 120B, GPT-OSS 20B, Qwen 3.6 27B | Qwen 3.6 27B is required for image-based tutor questions (vision support). |

Get a free key from [Google AI Studio](https://aistudio.google.com/) or [Groq Console](https://console.groq.com/), then paste it into Settings.

## Project Structure

```
StudyStudio/
├── index.html            # App shell, all view markup, modals
├── manifest.json         # PWA manifest
├── sw.js                 # Service worker (offline caching)
├── css/
│   ├── style.css           # Base layout, components, responsive rules
│   └── themes.css          # Theme color palettes + swatch picker UI
└── js/
    ├── config.js          # Shared localStorage keys & constants (loads first)
    ├── pwa.js             # Service worker registration + install prompt
    ├── api.js             # AI provider abstraction, quota tracking, callAI()
    ├── utils.js           # HTML escaping, markdown formatting, undo toasts, storage-quota guard
    ├── themes.js          # Theme picker logic & swatch rendering
    ├── srs.js             # Spaced-repetition scheduler (SM-2)
    ├── scores.js          # Quiz/exam score history log + trend UI
    ├── export.js          # Deck export to Anki/CSV
    ├── deck.js            # Flashcard deck: generation, Study/Quiz/Exam modes
    ├── socratic.js        # Main Socratic Tutor chat engine
    ├── maker.js           # Mock Quiz & Exam Maker
    ├── side-tutor.js      # Slide-out tutor drawer (used inside quiz/exam)
    ├── gwa.js             # GWA calculator
    ├── planner.js         # Task/schedule planner
    ├── notes.js           # Notes editor + "turn into flashcards"
    ├── pomodoro.js        # Pomodoro timer widget
    ├── watch.js           # Watch & Note (YouTube + timestamped notes/whiteboard)
    ├── dashboard.js       # Landing-screen Due Today widget + stats strip
    ├── settings.js        # Settings modal, provider/key config, backup export/import
    └── main.js            # Navigation, view switching, app init (loads last)
```

Scripts must load in the order listed in `index.html` — later files depend on globals defined by earlier ones (see the dependency comment at the top of each file, and the full load order documented above the `<script>` tags in `index.html`).

## Data & Privacy

Everything is stored locally in your browser via `localStorage`:

- Flashcard decks, SRS review schedules, and tutor conversations
- Notes, planner tasks, and score history
- Your GWA sheet and watch sessions
- Your selected theme
- Your AI provider settings and API key(s)

Nothing is sent anywhere except directly from your browser to your chosen AI provider (Google or Groq) when generating content. Clearing your browser data, switching browsers, or using a different device will lose this data unless you use **Settings → Export Backup** first.

### Storage limits

Browsers cap `localStorage` at roughly 5–10MB per site. StudyStudio guards against silently losing data when that limit is reached:

- A storage usage bar in **Settings → Your Data** shows an estimate of how much you're using.
- If a save fails because storage is full, a banner appears immediately rather than failing silently.
- Restoring a backup checks its size up front and reports honestly if only part of it could be restored, rather than claiming success.

If you're getting close to the limit, export a backup and delete old decks, notes, or watch sessions you no longer need.

## Browser Support

Any modern evergreen browser (Chrome, Firefox, Safari, Edge). Requires JavaScript and `localStorage` to be enabled.

## License

Add your license of choice here.
