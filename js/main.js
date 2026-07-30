// ============================================================
// StudyStudio — Main / Navigation / Init
// View switching between the 4 app views + landing screen,
// final app initialization, and the first-run onboarding hint.
// This must load LAST — after every other module has defined
// its functions and state (renderDeck, createTutorChat, etc).
// Depends on: config.js, api.js, deck.js, socratic.js, gwa.js,
//             settings.js
// ============================================================

    // Navigation
    const tabDeckBtn = document.getElementById('tabDeckBtn');
    const tabMakerBtn = document.getElementById('tabMakerBtn');
    const tabSocraticBtn = document.getElementById('tabSocraticBtn');
    const tabGwaBtn = document.getElementById('tabGwaBtn');
    const deckView = document.getElementById('deckView');
    const makerView = document.getElementById('makerView');
    const socraticView = document.getElementById('socraticView');
    const gwaView = document.getElementById('gwaView');
    const landingScreen = document.getElementById('landingScreen');

    const NAV_MAP = [
      {tab: tabDeckBtn, view: deckView},
      {tab: tabMakerBtn, view: makerView},
      {tab: tabSocraticBtn, view: socraticView},
      {tab: tabGwaBtn, view: gwaView}
    ];

    function switchToView(targetView) {
      landingScreen.style.display = 'none';
      NAV_MAP.forEach(({tab, view}) => {
        const active = view === targetView;
        tab.classList.toggle('active', active);
        view.classList.toggle('active', active);
      });
    }

    tabDeckBtn.addEventListener('click', () => switchToView(deckView));
    tabMakerBtn.addEventListener('click', () => switchToView(makerView));
    tabSocraticBtn.addEventListener('click', () => switchToView(socraticView));
    tabGwaBtn.addEventListener('click', () => switchToView(gwaView));

    document.getElementById('backToMenuBtn').addEventListener('click', () => {
      landingScreen.style.display = 'flex';
    });

    document.getElementById('landingFlashcardBtn').addEventListener('click', () => switchToView(deckView));
    document.getElementById('landingMakerBtn').addEventListener('click', () => switchToView(makerView));
    document.getElementById('landingSocraticBtn').addEventListener('click', () => switchToView(socraticView));
    document.getElementById('landingGwaBtn').addEventListener('click', () => switchToView(gwaView));


    // Init App
    renderDeck();

    // Bug Fix: Correctly initialize Socratic Chats on load
    if (tutorChats.length === 0) {
      const chat = createTutorChat("New Conversation");
      loadTutorChat(chat.id);
    } else {
      currentChatId = tutorChats[0].id;
      renderTutorChats();
      loadTutorChat(currentChatId);
    }

    // ---------- First-run onboarding hint ----------
    // Shown on the landing screen only when no AI key has been saved yet
    // (Flashcards/Maker/Socratic all silently fail without one otherwise)
    // and only until the user dismisses it or sets a key up.
    const LS_ONBOARDING_DISMISSED = 'deckflip_onboarding_dismissed';

    function initOnboardingHint() {
      const hint = document.getElementById('onboardingHint');
      if (!hint) return;

      const alreadyDismissed = localStorage.getItem(LS_ONBOARDING_DISMISSED) === '1';
      if (alreadyDismissed || getKey()) return;

      hint.style.display = 'flex';

      document.getElementById('onboardingSetupBtn').addEventListener('click', () => {
        localStorage.setItem(LS_ONBOARDING_DISMISSED, '1');
        hint.style.display = 'none';
        openSettings();
      });

      document.getElementById('onboardingDismissBtn').addEventListener('click', () => {
        localStorage.setItem(LS_ONBOARDING_DISMISSED, '1');
        hint.style.display = 'none';
      });
    }

    initOnboardingHint();
