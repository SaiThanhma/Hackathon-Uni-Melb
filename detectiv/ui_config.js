// =============================================================================
// ui_config.js — Centralised UI & animation configuration
//
// Every visual, timing, and behavioural knob for the Detective Game front-end
// lives here. Edit this file; do NOT touch script.js or styles.css for these
// settings — the runtime reads them automatically on startup.
//
// HOW IT WORKS
//   script.js imports UI_CONFIG at the top of its execution context.
//   All values are consumed via  UI_CONFIG.<section>.<key>  references.
//   CSS custom-properties that match config keys are injected into :root at
//   runtime by applyUiConfig() so that styles.css can also pick them up.
// =============================================================================

const UI_CONFIG = {

  // ---------------------------------------------------------------------------
  // COLOURS
  // Override the entire palette here. Values are injected as CSS variables at
  // runtime so they cascade into every rule in styles.css.
  // ---------------------------------------------------------------------------
  colors: {
    ink:    '#1a1512',   // page / body background (darkest)
    paper:  '#f2ead8',   // light document background
    aged:   '#e8dcc4',   // slightly darker document tint (case meta boxes, etc.)
    crease: '#c9b99a',   // mid-tone borders and dividers
    red:    '#8b1a1a',   // accusation accent, danger buttons, stamp
    gold:   '#a07a30',   // active tabs, confession border, win colour
    smoke:  '#6b5f52',   // secondary text labels
    dim:    '#9e8e7e',   // tertiary / placeholder text
  },

  // ---------------------------------------------------------------------------
  // TYPOGRAPHY
  // ---------------------------------------------------------------------------
  typography: {
    // Google Fonts import URL — swap out fonts by replacing this URL.
    // Set to null to skip injecting a <link> (use your own stylesheet instead).
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap',

    fontBody:    "'Courier Prime', monospace",   // body / code / UI text
    fontHeading: "'Playfair Display', serif",    // H1, case title, solved headline

    // Base font sizes (px)
    sizeBase:      14,   // chat bubble text
    sizeSmall:     12,   // secondary labels, hint text
    sizeTiny:       9,   // all-caps micro-labels
    sizeH1Min:     52,   // clamp() minimum for the big title
    sizeH1Max:     88,   // clamp() maximum for the big title
    sizeCaseTitle: 28,   // dossier case title
    sizeSolvedHeadline: 36,
  },

  // ---------------------------------------------------------------------------
  // LAYOUT
  // ---------------------------------------------------------------------------
  layout: {
    // Max width of the main content column (px)
    maxWidth: 780,

    // Horizontal page padding (px)
    pagePaddingX: 24,

    // Vertical page padding for screens (px)
    pagePaddingY: 40,

    // Game panel height — CSS min() expression used directly in styles.css
    // Change the numbers here if you want a taller / shorter chat window.
    gamePanelHeight:    'min(85vh, 720px)',
    gamePanelHeightMob: '92vh',   // applied below 720 px viewport width
    gamePanelMinHeight: 480,      // px — absolute floor

    // Music dock position (fixed, from edge, px)
    musicDockTop:   16,
    musicDockRight: 16,

    // Size of the mute / new-game icon buttons in the dock (px)
    musicDockBtnSize: 36,
  },

  // ---------------------------------------------------------------------------
  // ANIMATIONS
  // Durations in milliseconds unless noted.
  // ---------------------------------------------------------------------------
  animation: {
    // ── Screen transitions ────────────────────────────────────────────────
    // The "scroll-up" new-game animation:
    //   1. The body slides upward via a CSS transform over `scrollUpDuration` ms
    //      using the `scrollUpEasing` curve.
    //   2. After `scrollUpScreenSwapDelay` ms the screen class is switched.
    //   3. A brief cross-fade (`fadeInDuration`) then reveals the intro screen.
    scrollUpBehavior: 'smooth',   // 'smooth' | 'auto'
    scrollUpMinDelay: 200,        // ms
    scrollUpMaxDelay: 600,        // ms
    scrollUpDistanceFactor: 0.35, // multiplier for window.scrollY

    // The "scroll-down" Begin Investigation animation (scrollIntoView):
    scrollDownBehavior: 'smooth',   // 'smooth' | 'auto'

    // Generic screen / element fade-in when a new screen appears
    fadeInDuration:  400,   // ms
    fadeInTranslateY: 8,    // px — tiny vertical lift at fade start

    // Brief-screen fade-in (used by #screen-brief rule in CSS)
    briefFadeInDuration: 400,

    // Game panel open animation (when "Begin Questioning" is clicked)
    gamePanelOpenDuration: 350,

    // A4 page switch fade
    a4FadeDuration: 300,

    // ── Chat / typing ─────────────────────────────────────────────────────
    // Typewriter effect for suspect replies
    typingCharsPerSecNormal: 38,   // chars/sec for short replies (≤ 300 chars)
    typingCharsPerSecFast:   55,   // chars/sec for long replies (> 300 chars)
    typingLongReplyThreshold: 300, // char count at which fast speed kicks in

    // Message bubble entrance animation
    msgFadeDuration: 250,  // ms

    // Accusation trial: message entrance animation
    accuseMsgFadeDuration: 200,  // ms

    // ── Overlays & modals ─────────────────────────────────────────────────
    // How long after case-end before the solved overlay appears
    solvedOverlayDelay: 1000,  // ms

    // Fade duration for the solved overlay itself
    solvedFadeDuration: 400,   // ms

    // Post-confession gate fade
    postConfessionFadeDuration: 350,  // ms

    // ── Miscellaneous ─────────────────────────────────────────────────────
    // Music volume popup hover close delay (ms) — prevents flicker on gap crossing
    musicPopupCloseDelay: 120,

    // Spinner rotation speed
    spinnerDuration: 700,   // ms per full revolution

    // Pulsing loading text period
    pulseDuration: 1500,   // ms

    // Accusation timer pulse when seconds are low
    accuseTimerPulseDuration: 800,  // ms

    // Game timer "warn" colour — applied when this many ms remain
    gameTimerWarnThresholdMs: 60000,  // 1 minute
  },

  // ---------------------------------------------------------------------------
  // GAME DEFAULTS (mirrored from config.py; changing these only affects the UI)
  // The server always validates server-side — keep these in sync with config.py.
  // ---------------------------------------------------------------------------
  gameDefaults: {
    // Pre-selected option on the intro screen
    defaultPlayers:    3,       // 2–5
    defaultDifficulty: 'normal', // 'easy' | 'normal' | 'hard'
    defaultLanguage:   'English',
    defaultTimeLimit:  null,    // null = no limit | 5 | 10 (minutes)

    // Available options shown in the Settings panel
    playerOptions:     [2, 3, 4, 5],
    difficultyOptions: ['easy', 'normal', 'hard'],
    languageOptions:   [
      { label: 'English',      value: 'English'    },
      { label: 'Deutsch',      value: 'German'     },
      { label: '中文',          value: 'Chinese'    },
      { label: 'Tiếng Việt',   value: 'Vietnamese' },
    ],
    timeLimitOptions:  [
      { label: 'None',  value: null },
      { label: '5 min', value: 5   },
      { label: '10 min',value: 10  },
    ],
  },

  // ---------------------------------------------------------------------------
  // ACCUSATION HEARING
  // ---------------------------------------------------------------------------
  accusation: {
    // Duration of the timed hearing in seconds.
    // Must match ACCUSATION_SECONDS in config.py — both must agree.
    hearingSeconds: 90,

    // Colour of the accusation timer when time is running normally
    timerColorNormal: '#8b1a1a',  // var(--red)

    // Colour / behaviour when time is low
    timerWarnThresholdSeconds: 20,
    timerColorWarn: '#c9a227',    // amber

    // Whether to pulse the timer in the warn state
    timerWarnPulse: true,

    // Label shown in the accusation panel header
    hearingLabel: 'Formal Accusation — Hearing',

    // Reminder text shown below the header
    hearingHint: 'What is the <strong>motive</strong> and <strong>method</strong>?',

    // Placeholder text in the accusation textarea
    textareaPlaceholder: 'Your statement…',

    // Button labels
    sendButtonLabel: 'Send',
    abandonButtonLabel: '✗ Abandon accusation',
    hintsButtonLabel: '💡 Hints',
    hintsButtonHideLabel: '💡 Hide hints',
  },

  // ---------------------------------------------------------------------------
  // CHAT INPUT
  // ---------------------------------------------------------------------------
  chatInput: {
    // Placeholder when active
    placeholder: 'Ask a question…',

    // Placeholder when case is closed / read-only
    readOnlyPlaceholder: 'Case closed — transcripts below are read-only.',

    // Whether Enter (without Shift) sends the message
    enterToSend: true,

    // Maximum height of the auto-growing textarea (px)
    maxHeight: 100,

    // Minimum height (px)
    minHeight: 44,
  },

  // ---------------------------------------------------------------------------
  // HINTS
  // ---------------------------------------------------------------------------
  hints: {
    // Label for the hint toolbar button
    buttonLabel: '💡 Hint',

    // Label when all hints are used
    exhaustedLabel: 'No more hints',

    // Title tooltip template; {n} = number of hints remaining
    tooltipTemplate: '{n} hint{s} left',

    // Empty-state placeholder text in the hints panel
    emptyStateText: 'Use the 💡 Hint button to request your first hint.',
  },

  // ---------------------------------------------------------------------------
  // SOLVED / GAME-OVER OVERLAY
  // ---------------------------------------------------------------------------
  solved: {
    stamps: {
      won:              'Case Closed',
      gaveUp:           'You Gave Up',
      timeUp:           "Time's Up",
      accusationFail:   'Not proven',
      accusationAbandon:'Accusation withdrawn',
    },
    headlines: {
      won:  'Solved.',
      lost: 'The Truth.',
    },
    // Copy shown in the dismiss button area (won vs gave-up paths)
    dismissCopyWon:    'Close this summary to read the full confession in the interrogation transcript.',
    dismissCopyGaveUp: 'Close this summary to read your interrogations and detective notes.',
  },

  // ---------------------------------------------------------------------------
  // MUSIC DOCK
  // ---------------------------------------------------------------------------
  music: {
    // Default volume (0.0–1.0)
    defaultVolume: 0.6,

    // Default muted state
    defaultMuted: false,

    // localStorage keys used to persist preferences
    storageKeyVolume: 'musicVolume',
    storageKeyMuted:  'musicMuted',

    // Height of the vertical volume slider (px)
    sliderHeight: 88,

    // Delay before closing the volume popup when the mouse leaves (ms)
    popupCloseDelay: 120,

    // Accepted audio file extensions (server-side filtering — keep in sync with server.py)
    extensions: ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.webm', '.opus'],
  },

  // ---------------------------------------------------------------------------
  // DOSSIER / A4 PAGES
  // ---------------------------------------------------------------------------
  dossier: {
    // Aspect ratio of each A4 page (width / height)
    // 210 mm / 297 mm = ~0.707  →  expressed as '1 / 1.414'
    pageAspectRatio: '1 / 1.414',

    // Inner padding (px)
    pagePaddingX: 52,
    pagePaddingY_top: 48,
    pagePaddingY_bottom: 40,

    // Stamp text on page 1
    stampText: 'Confidential',

    // "Appendix" stamp label on page 2
    appendixStampText: 'Appendix A',

    // Page navigation button labels
    prevLabel: '← Prev',
    nextLabel: 'Next →',
  },

  // ---------------------------------------------------------------------------
  // RETRY / NETWORK
  // ---------------------------------------------------------------------------
  network: {
    // How many times to retry a failed API call before giving up
    maxRetries: 5,

    // Delay between retry attempts (ms)
    retryDelay: 800,
  },

  // ---------------------------------------------------------------------------
  // CONFIRM DIALOGS
  // Text used in browser confirm() calls
  // ---------------------------------------------------------------------------
  confirms: {
    giveUp:    'Give up and reveal the solution?',
    newGame:   'Abandon this case and start a new one?',
  },

  // ---------------------------------------------------------------------------
  // NOISE / GRAIN OVERLAY
  // The subtle film-grain texture rendered via an SVG filter on body::before.
  // ---------------------------------------------------------------------------
  grain: {
    // Opacity of the grain overlay (0–1)
    opacity: 0.4,

    // baseFrequency of the feTurbulence filter — higher = finer grain
    baseFrequency: 0.9,

    // numOctaves of the feTurbulence filter — higher = more detail, slower
    numOctaves: 4,
  },

};

// =============================================================================
// Runtime application
// Inject all colour tokens and a handful of timing values as CSS custom
// properties so that styles.css (and any future stylesheet) can reference them
// without touching JavaScript.
// =============================================================================
(function applyUiConfig() {
  const root = document.documentElement;
  const c = UI_CONFIG.colors;
  const a = UI_CONFIG.animation;
  const t = UI_CONFIG.typography;

  // Colour palette
  root.style.setProperty('--ink',    c.ink);
  root.style.setProperty('--paper',  c.paper);
  root.style.setProperty('--aged',   c.aged);
  root.style.setProperty('--crease', c.crease);
  root.style.setProperty('--red',    c.red);
  root.style.setProperty('--gold',   c.gold);
  root.style.setProperty('--smoke',  c.smoke);
  root.style.setProperty('--dim',    c.dim);

  // Animation durations (exposed as CSS vars for @keyframes / transition use)
  root.style.setProperty('--anim-fade-in',            `${a.fadeInDuration}ms`);
  root.style.setProperty('--anim-fade-in-translate-y',`${a.fadeInTranslateY}px`);
  root.style.setProperty('--anim-brief-fade',         `${a.briefFadeInDuration}ms`);
  root.style.setProperty('--anim-game-panel',         `${a.gamePanelOpenDuration}ms`);
  root.style.setProperty('--anim-a4-fade',            `${a.a4FadeDuration}ms`);
  root.style.setProperty('--anim-msg-fade',           `${a.msgFadeDuration}ms`);
  root.style.setProperty('--anim-spinner',            `${a.spinnerDuration}ms`);
  root.style.setProperty('--anim-pulse',              `${a.pulseDuration}ms`);
  root.style.setProperty('--anim-accuse-timer-pulse', `${a.accuseTimerPulseDuration}ms`);

  // Layout
  root.style.setProperty('--max-width',               `${UI_CONFIG.layout.maxWidth}px`);
  root.style.setProperty('--page-padding-x',          `${UI_CONFIG.layout.pagePaddingX}px`);
  root.style.setProperty('--page-padding-y',          `${UI_CONFIG.layout.pagePaddingY}px`);
  root.style.setProperty('--game-panel-height',       UI_CONFIG.layout.gamePanelHeight);
  root.style.setProperty('--game-panel-min-height',   `${UI_CONFIG.layout.gamePanelMinHeight}px`);
  root.style.setProperty('--music-dock-btn-size',     `${UI_CONFIG.layout.musicDockBtnSize}px`);
  root.style.setProperty('--music-slider-height',     `${UI_CONFIG.music.sliderHeight}px`);
  root.style.setProperty('--music-popup-close-delay', `${UI_CONFIG.music.popupCloseDelay}ms`);

  // Typography
  root.style.setProperty('--font-body',    t.fontBody);
  root.style.setProperty('--font-heading', t.fontHeading);
  root.style.setProperty('--size-base',    `${t.sizeBase}px`);
  root.style.setProperty('--size-small',   `${t.sizeSmall}px`);
  root.style.setProperty('--size-tiny',    `${t.sizeTiny}px`);

  // Accusation timer colours
  root.style.setProperty('--accuse-timer-color', UI_CONFIG.accusation.timerColorNormal);
  root.style.setProperty('--accuse-timer-warn',  UI_CONFIG.accusation.timerColorWarn);
})();