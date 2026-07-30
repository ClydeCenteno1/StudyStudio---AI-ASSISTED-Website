# StudyStudio

An all-in-one AI study companion for students: turn your notes into flashcards, generate mock quizzes and exams, get Socratic-style tutoring, and calculate your GWA — all running client-side, with your own AI API key.

## Features

- **⚡ Flashcards** — Paste your notes and get a full deck of flashcards. Study, flip, and self-check with AI grading.
- **📝 Mock Quiz & Exam Maker** — Give a topic, upload notes/photos/PDFs, and choose your question types. Get a custom quiz or timed exam, complete with hints.
- **🏛️ Socratic Tutor** — Stuck on a problem? Talk it through step-by-step with a tutor that asks guiding questions instead of just giving answers. Supports image uploads and LaTeX math rendering.
- **🎓 GWA Calculator** — Compute your Philippine General Weighted Average (1.00–5.00 scale) — add each subject's grade and units, with optional subject exclusion.
- **🎨 Theming** — Six built-in color themes (Dark, Light, Pink, Red, Forest, Ocean).
- **💾 Backup & Restore** — Export your full local dataset (decks, tutor chats, GWA sheets, theme, and API keys) to a JSON file, and import it back on any device.

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
├── index.html          # App shell, all view markup, modals
├── css/
│   ├── style.css        # Base layout, components, responsive rules
│   └── themes.css        # Theme color palettes + swatch picker UI
└── js/
    ├── config.js          # Shared localStorage keys & constants (loads first)
    ├── api.js             # AI provider abstraction, quota tracking, callAI()
    ├── utils.js           # Shared helpers: HTML escaping, markdown formatting, chat bubbles
    ├── themes.js          # Theme picker logic & swatch rendering
    ├── deck.js            # Flashcard deck: generation, Study/Quiz/Exam modes
    ├── socratic.js        # Main Socratic Tutor chat engine
    ├── maker.js           # Mock Quiz & Exam Maker
    ├── side-tutor.js      # Slide-out tutor drawer (used inside quiz/exam)
    ├── gwa.js             # GWA calculator
    ├── settings.js        # Settings modal, provider/key config, backup export/import
    └── main.js            # Navigation, view switching, app init, onboarding hint
```

Scripts must load in the order listed in `index.html` — later files depend on globals defined by earlier ones (see the dependency comment at the top of each file).

## Data & Privacy

Everything is stored locally in your browser via `localStorage`:

- Flashcard decks and tutor conversations
- Your GWA sheet
- Your selected theme
- Your AI provider settings and API key(s)

Nothing is sent anywhere except directly from your browser to your chosen AI provider (Google or Groq) when generating content. Clearing your browser data, switching browsers, or using a different device will lose this data unless you use **Settings → Export Backup** first.

## Browser Support

Any modern evergreen browser (Chrome, Firefox, Safari, Edge). Requires JavaScript and `localStorage` to be enabled.

## License

Add your license of choice here.
