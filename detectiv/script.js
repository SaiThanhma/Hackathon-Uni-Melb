const API = 'http://localhost:5000/api';

let sessionId = null;
let playerName = null;
let suspects = [];
let currentSuspect = null;
let transcripts = {};
/** When set, closing the post-confession gate opens the solved overlay. */
let pendingSolvedPayload = null;
/** Hints shown only in the hints panel, not in suspect threads. */
let hintLog = [];
/** After give-up summary is dismissed; server session already solved. */
let caseReadOnly = false;
/** From server; ladder length for this case. */
let maxHints = 5;
let hintsExhausted = false;

const settings = { players: 3, difficulty: 'normal', language: 'English', timeLimitMinutes: null };

/** Background music: files in server `music/` folder, shuffled playlist, loop playlist. */
const music = {
  tracks: [],
  order: [],
  idx: 0,
  audio: null,
  muted: false,
  volume: 0.6,
};

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadMusicPrefs() {
  try {
    const v = localStorage.getItem('musicVolume');
    if (v !== null) {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) music.volume = Math.max(0, Math.min(1, n));
    }
    music.muted = localStorage.getItem('musicMuted') === 'true';
  } catch (_) { /* ignore */ }
}

function saveMusicPrefs() {
  try {
    localStorage.setItem('musicVolume', String(music.volume));
    localStorage.setItem('musicMuted', music.muted ? 'true' : 'false');
  } catch (_) { /* ignore */ }
}

function applyMusicOutput() {
  const el = music.audio;
  if (!el) return;
  el.muted = music.muted;
  el.volume = music.volume;
}

function updateMusicDockUI() {
  const dock = document.getElementById('music-dock');
  const btn = document.getElementById('music-mute-btn');
  const range = document.getElementById('music-volume');
  if (dock) dock.hidden = music.tracks.length === 0;
  if (btn) {
    btn.textContent = music.muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', music.muted ? 'true' : 'false');
    btn.title = music.muted ? 'Unmute music' : 'Mute music';
  }
  if (range) range.value = String(Math.round(music.volume * 100));
}

function initMusicAudio() {
  if (music.audio) return;
  const el = document.getElementById('bg-music');
  if (!el) return;
  music.audio = el;
  el.addEventListener('ended', onMusicTrackEnded);
  applyMusicOutput();
}

function onMusicTrackEnded() {
  const el = music.audio;
  if (!el || music.tracks.length === 0) return;
  if (music.tracks.length === 1) {
    el.currentTime = 0;
    el.play().catch(() => {});
    return;
  }
  music.idx += 1;
  if (music.idx >= music.order.length) {
    music.order = shuffleInPlace([...music.tracks]);
    music.idx = 0;
  }
  playMusicAtCurrentIndex();
}

function playMusicAtCurrentIndex() {
  const el = music.audio;
  const name = music.order[music.idx];
  if (!el || !name) return;
  const base = window.location.origin;
  el.src = `${base}/music/${encodeURIComponent(name)}`;
  el.play().catch(() => {});
}

async function fetchMusicTracks() {
  try {
    const res = await fetch(`${window.location.origin}/api/music/tracks`);
    const data = await res.json();
    music.tracks = Array.isArray(data.tracks) ? data.tracks : [];
  } catch (_) {
    music.tracks = [];
  }
  updateMusicDockUI();
}

function startMusicPlayback() {
  initMusicAudio();
  if (music.tracks.length === 0) return;
  music.order = shuffleInPlace([...music.tracks]);
  music.idx = 0;
  applyMusicOutput();
  updateMusicDockUI();
  playMusicAtCurrentIndex();
}

function stopMusicPlayback() {
  const el = music.audio;
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

function toggleMusicMute() {
  music.muted = !music.muted;
  applyMusicOutput();
  saveMusicPrefs();
  updateMusicDockUI();
}

function setMusicVolumeFromSlider(value01) {
  music.volume = Math.max(0, Math.min(1, value01));
  applyMusicOutput();
  saveMusicPrefs();
  updateMusicDockUI();
}

function wireMusicControls() {
  const btn = document.getElementById('music-mute-btn');
  const range = document.getElementById('music-volume');
  if (btn) btn.addEventListener('click', () => toggleMusicMute());
  if (range) {
    range.addEventListener('input', (e) => {
      setMusicVolumeFromSlider(parseInt(e.target.value, 10) / 100);
    });
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadMusicPrefs();
    wireMusicControls();
    fetchMusicTracks();
    const range = document.getElementById('music-volume');
    if (range) range.value = String(Math.round(music.volume * 100));
    updateMusicDockUI();
  });
}

/** Single formal accusation per case; timed hearing state. */
let accusationConsumed = false;
let accusationTrialEndMs = null;
let accusationTimerId = null;
let accusationTargetName = null;
/** @type {{ role: string, text: string }[]} */
let accusationTrialLines = [];
let accusationSubmitting = false;
/** Saved accusation data for post-game reading. Set when the hearing ends. */
let savedAccusationLines = null;
let savedAccusationTarget = null;

/** Countdown while questioning; cleared when case ends or new game. */
let gameTimerIntervalId = null;
let gameDeadlineMs = null;

function setOpt(key, val, btn) {
  if (key === 'timeLimitMinutes') {
    settings[key] = val === 'none' ? null : Number(val);
  } else {
    settings[key] = val;
  }
  const group = btn.closest('.setting-options');
  group.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function clearGameTimer() {
  if (gameTimerIntervalId != null) {
    clearInterval(gameTimerIntervalId);
    gameTimerIntervalId = null;
  }
  gameDeadlineMs = null;
  const el = document.getElementById('game-timer');
  if (el) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('game-timer--warn');
  }
}

function tickGameTimer() {
  const el = document.getElementById('game-timer');
  if (!el || gameDeadlineMs == null) return;
  const left = gameDeadlineMs - Date.now();
  if (left <= 0) {
    clearGameTimer();
    handleTimeUp();
    return;
  }
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('game-timer--warn', m < 1);
}

function startGameTimerIfNeeded() {
  clearGameTimer();
  const mins = settings.timeLimitMinutes;
  if (mins == null || mins <= 0) return;
  gameDeadlineMs = Date.now() + mins * 60 * 1000;
  const el = document.getElementById('game-timer');
  if (el) {
    el.hidden = false;
    tickGameTimer();
  }
  gameTimerIntervalId = setInterval(tickGameTimer, 1000);
}

async function handleTimeUp() {
  if (!sessionId || caseReadOnly) return;
  setLoading(true);
  clearError('game-error');
  try {
    const res = await fetch(`${API}/give_up`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ session_id: sessionId })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showSolved(data.solution, false, true);
  } catch (e) {
    showError('game-error', e.message);
  }
  setLoading(false);
}

/** A4 page navigation: currentA4Page tracks which page (0=case, 1=poi, 2=motives) is shown. */
let currentA4Page = 0;
const A4_PAGE_IDS = ['a4-page-case', 'a4-page-poi'];

function a4GoTo(delta, absolute) {
  const next = absolute ? delta : currentA4Page + delta;
  if (next < 0 || next >= A4_PAGE_IDS.length) return;
  currentA4Page = next;
  A4_PAGE_IDS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('a4-active', i === currentA4Page);
  });
  // Update nav buttons
  const prev = document.getElementById('a4-prev');
  const nextBtn = document.getElementById('a4-next');
  if (prev) prev.disabled = currentA4Page === 0;
  if (nextBtn) nextBtn.disabled = currentA4Page === A4_PAGE_IDS.length - 1;
  // Update dots
  document.querySelectorAll('.a4-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentA4Page);
  });
}

function resetDossierToCaseSummary() {
  a4GoTo(0, true);
}

function buildBriefSuspectCard(s, i) {
  const el = document.createElement('div');
  el.className = 'suspect-card suspect-card--dossier';

  const row = document.createElement('div');
  row.className = 'suspect-card-top';

  const num = document.createElement('span');
  num.className = 'suspect-number';
  num.textContent = String(i + 1).padStart(2, '0');

  const nm = document.createElement('span');
  nm.className = 'suspect-name';
  nm.textContent = s.name;

  const role = document.createElement('span');
  role.className = 'suspect-role';
  role.textContent = s.role;

  row.appendChild(num);
  row.appendChild(nm);
  row.appendChild(role);
  el.appendChild(row);

  if (s.personality) {
    const desc = document.createElement('p');
    desc.style.cssText = 'font-size:12px;color:var(--smoke);margin-top:6px;line-height:1.5;font-style:italic;';
    desc.textContent = s.personality;
    el.appendChild(desc);
  }

  if (s.why_suspected) {
    const grounds = document.createElement('div');
    grounds.className = 'suspect-grounds';
    const glabel = document.createElement('span');
    glabel.className = 'suspect-grounds-label';
    glabel.textContent = 'Grounds for suspicion';
    const gtext = document.createElement('p');
    gtext.className = 'suspect-grounds-text';
    gtext.textContent = s.why_suspected;
    grounds.appendChild(glabel);
    grounds.appendChild(gtext);
    el.appendChild(grounds);
  }

  return el;
}

function buildBriefMotiveCard(s, i) {
  const el = document.createElement('div');
  el.className = 'suspect-card suspect-card--dossier';

  const row = document.createElement('div');
  row.className = 'suspect-card-top';

  const num = document.createElement('span');
  num.className = 'suspect-number';
  num.textContent = String(i + 1).padStart(2, '0');

  const nm = document.createElement('span');
  nm.className = 'suspect-name';
  nm.textContent = s.name;

  row.appendChild(num);
  row.appendChild(nm);
  el.appendChild(row);

  const grounds = document.createElement('div');
  grounds.className = 'suspect-grounds';
  const glabel = document.createElement('span');
  glabel.className = 'suspect-grounds-label';
  glabel.textContent = 'Grounds for suspicion';
  const gtext = document.createElement('p');
  gtext.className = 'suspect-grounds-text';
  gtext.textContent = s.why_suspected || '';
  grounds.appendChild(glabel);
  grounds.appendChild(gtext);
  el.appendChild(grounds);

  return el;
}

// ===== GAME FLOW =====
function newGame() {
  clearGameTimer();
  clearAccusationTimer();
  accusationConsumed = false;
  savedAccusationLines = null;
  savedAccusationTarget = null;
  stopMusicPlayback();
  sessionId = null;
  playerName = null;
  suspects = [];
  currentSuspect = null;
  transcripts = {};
  hintLog = [];
  maxHints = 5;
  hintsExhausted = false;
  pendingSolvedPayload = null;
  releaseCaseReadOnlyUI();
  const postGate = document.getElementById('post-confession-gate');
  if (postGate) postGate.classList.remove('show');
  document.getElementById('solved-overlay').classList.remove('show');
  document.getElementById('accuse-panel-trial').style.display = 'none';
  document.getElementById('interrogation-view').style.display = '';
  document.getElementById('transcript').innerHTML = '';
  const hintBox = document.getElementById('hint-transcript');
  if (hintBox) hintBox.innerHTML = '';
  document.getElementById('msg-input').value = '';
  const briefGame = document.getElementById('brief-game');
  if (briefGame) {
    briefGame.classList.remove('open');
    briefGame.setAttribute('aria-hidden', 'true');
  }
  const beginActions = document.getElementById('brief-begin-actions');
  if (beginActions) beginActions.style.display = '';
  clearError('game-error');
  clearError('intro-error');
  document.getElementById('btn-start').disabled = false;
  document.getElementById('loading-intro').style.display = 'none';
  showScreen('screen-intro');
}

function confirmNewGame() {
  if (confirm('Abandon this case and start a new one?')) newGame();
}

async function withRetry(fn, maxAttempts, onAttempt) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      onAttempt(attempt, null);
      return await fn();
    } catch (e) {
      lastErr = e;
      onAttempt(attempt, e.message);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

async function startGame() {
  document.getElementById('btn-start').disabled = true;
  document.getElementById('loading-intro').style.display = 'block';
  document.getElementById('intro-error').textContent = '';

  try {
    const data = await withRetry(
      async () => {
        const res = await fetch(`${API}/new_game`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ n_players: settings.players, difficulty: settings.difficulty, language: settings.language })
        });
        const d = await res.json();
        if (d.error) throw new Error(d.error);
        return d;
      },
      3,
      (attempt, err) => {
        if (err) {
          document.getElementById('intro-error').textContent =
            `Attempt ${attempt-1}/3 failed: ${err} — retrying…`;
        } else if (attempt > 1) {
          document.getElementById('intro-error').textContent =
            `Retrying… (attempt ${attempt}/3)`;
        }
      }
    );

    document.getElementById('intro-error').textContent = '';
    sessionId = data.session_id;
    playerName = data.player_name;
    suspects = data.suspects;
    maxHints = typeof data.max_hints === 'number' && data.max_hints >= 0 ? data.max_hints : 5;
    hintsExhausted = false;
    suspects.forEach(s => transcripts[s.name] = []);

    document.getElementById('brief-title').textContent = data.title;
    document.getElementById('brief-detective').textContent = data.player_name;
    document.getElementById('brief-victim').textContent = data.victim;
    document.getElementById('brief-crime').textContent = data.crime;
    document.getElementById('brief-setting').textContent = data.setting;
    document.getElementById('brief-prestory').textContent = data.pre_story;

    const diffMap = { easy: '🟢 Easy', normal: '🟡 Normal', hard: '🔴 Hard' };
    document.getElementById('brief-difficulty').textContent = diffMap[settings.difficulty] || settings.difficulty;
    document.getElementById('brief-language').textContent = settings.language;
    const tl = settings.timeLimitMinutes;
    document.getElementById('brief-time-limit').textContent =
      tl == null ? 'None' : `${tl} min`;

    const cards = document.getElementById('brief-suspects');
    cards.innerHTML = '';
    suspects.forEach((s, i) => cards.appendChild(buildBriefSuspectCard(s, i)));

    const motives = document.getElementById('brief-motives');
    if (motives) {
      motives.innerHTML = '';
      suspects.forEach((s, i) => motives.appendChild(buildBriefMotiveCard(s, i)));
    }

    const bg = document.getElementById('brief-game');
    if (bg) {
      bg.classList.remove('open');
      bg.setAttribute('aria-hidden', 'true');
    }
    const ba = document.getElementById('brief-begin-actions');
    if (ba) ba.style.display = '';

    hintLog = [];
    const hintEl = document.getElementById('hint-transcript');
    if (hintEl) hintEl.innerHTML = '';
    releaseCaseReadOnlyUI();
    resetDossierToCaseSummary();
    showScreen('screen-brief');
    // Scroll to the case file after it renders
    requestAnimationFrame(() => {
      const caseFile = document.querySelector('.case-file--dossier');
      if (caseFile) caseFile.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } catch (e) {
    document.getElementById('intro-error').textContent = `Failed after 3 attempts: ${e.message}`;
    document.getElementById('btn-start').disabled = false;
  }
  document.getElementById('loading-intro').style.display = 'none';
}

async function enterGame() {
  releaseCaseReadOnlyUI();
  document.getElementById('game-title').textContent = document.getElementById('brief-title').textContent;
  document.getElementById('game-detective').textContent = playerName;

  const tabs = document.getElementById('suspect-tabs');
  const accuseSel = document.getElementById('accuse-select');

  tabs.innerHTML = '';
  accuseSel.innerHTML = '';

  suspects.forEach(s => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'suspect-tab';
    tab.textContent = s.name;
    tab.dataset.name = s.name;
    tab.onclick = () => switchSuspect(s.name);
    tabs.appendChild(tab);

    const aopt = document.createElement('option');
    aopt.value = s.name;
    aopt.textContent = `${s.name} — ${s.role}`;
    accuseSel.appendChild(aopt);
  });

  const hintTab = document.createElement('button');
  hintTab.type = 'button';
  hintTab.className = 'suspect-tab suspect-tab--hints';
  hintTab.dataset.tab = 'hints';
  hintTab.textContent = '💡 Hints';
  hintTab.title = 'Open your detective hint log';
  hintTab.onclick = () => showHintsChatTab();
  tabs.appendChild(hintTab);

  currentSuspect = suspects[0].name;
  switchSuspect(currentSuspect);

  document.getElementById('brief-begin-actions').style.display = 'none';
  const panel = document.getElementById('brief-game');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  updateHintUI();
  startGameTimerIfNeeded();
  await fetchMusicTracks();
  startMusicPlayback();
  updateAccuseButton();
}


function switchSuspect(name) {
  currentSuspect = name;

  document.querySelectorAll('.suspect-tab').forEach(t => {
    if (t.dataset.tab === 'hints' || t.dataset.tab === 'accusation') {
      t.classList.remove('active');
    } else {
      t.classList.toggle('active', t.dataset.name === name);
    }
  });

  const mainPanel = document.getElementById('chat-panel-main');
  const hintsPanel = document.getElementById('chat-panel-hints');
  const accusPanel = document.getElementById('chat-panel-accusation');
  if (mainPanel) mainPanel.classList.add('is-active');
  if (hintsPanel) hintsPanel.classList.remove('is-active');
  if (accusPanel) accusPanel.classList.remove('is-active');

  renderTranscript();
}

function showHintsChatTab() {
  document.querySelectorAll('.suspect-tab').forEach(t => {
    if (t.dataset.tab === 'hints') {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  const mainPanel = document.getElementById('chat-panel-main');
  const hintsPanel = document.getElementById('chat-panel-hints');
  const accusPanel = document.getElementById('chat-panel-accusation');
  if (mainPanel) mainPanel.classList.remove('is-active');
  if (hintsPanel) hintsPanel.classList.add('is-active');
  if (accusPanel) accusPanel.classList.remove('is-active');
  renderHintPanel();
  const box = document.getElementById('hint-transcript');
  if (box) box.scrollTop = box.scrollHeight;
}

function renderTranscript() {
  const box = document.getElementById('transcript');
  const msgs = transcripts[currentSuspect] || [];
  box.innerHTML = '';
  msgs.forEach(m => box.appendChild(buildMsgEl(m)));
  box.scrollTop = box.scrollHeight;
}

function buildMsgEl({ role, text, type }) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const label = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = role === 'player' ? `Det. ${playerName}` : currentSuspect;
  if (role === 'hint') { label.textContent = 'HINT'; div.className = 'msg hint'; }
  if (role === 'system') { label.textContent = 'CASE FILE'; div.className = 'msg system'; }
  if (type === 'confess' && role === 'suspect') {
    div.className = 'msg suspect confess-final';
    label.textContent = `${currentSuspect} — confession`;
  }
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  if (type === 'accuse' && role === 'player') { div.className = 'msg player accuse'; }
  bubble.textContent = text;
  div.appendChild(label);
  div.appendChild(bubble);
  return div;
}

function addMsg(suspectName, role, text, type) {
  const saved = currentSuspect;
  currentSuspect = suspectName;
  if (!transcripts[suspectName]) transcripts[suspectName] = [];
  transcripts[suspectName].push({ role, text, type });
  if (saved === suspectName) {
    const box = document.getElementById('transcript');
    box.appendChild(buildMsgEl({ role, text, type }));
    box.scrollTop = box.scrollHeight;
  }
  currentSuspect = saved;
}

/**
 * Like addMsg but animates the text word-by-word for suspect replies.
 * Returns a Promise that resolves when typing is complete.
 */
function addMsgTyped(suspectName, role, text, type) {
  const saved = currentSuspect;
  currentSuspect = suspectName;
  if (!transcripts[suspectName]) transcripts[suspectName] = [];
  transcripts[suspectName].push({ role, text, type });

  // If the suspect tab isn't active right now, just store silently — no animation
  if (saved !== suspectName) {
    currentSuspect = saved;
    return Promise.resolve();
  }

  const box = document.getElementById('transcript');

  // Build the message element but leave the bubble empty for now
  const el = buildMsgEl({ role, text: '', type });
  const bubble = el.querySelector('.msg-bubble');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  currentSuspect = saved;

  // Speed: chars per second. Scales down slightly for very long replies.
  const CHARS_PER_SEC = text.length > 300 ? 55 : 38;
  const INTERVAL_MS = 1000 / CHARS_PER_SEC;

  return new Promise(resolve => {
    let i = 0;

    // Blinking cursor element
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.textContent = '▍';
    bubble.appendChild(cursor);

    const tick = setInterval(() => {
      if (i < text.length) {
        // Insert character before the cursor
        cursor.insertAdjacentText('beforebegin', text[i]);
        i++;
        box.scrollTop = box.scrollHeight;
      } else {
        clearInterval(tick);
        cursor.remove();
        resolve();
      }
    }, INTERVAL_MS);
  });
}

function buildHintPanelMsg(text, index) {
  const div = document.createElement('div');
  div.className = 'msg hint';
  const label = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = `Hint ${index}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  div.appendChild(label);
  div.appendChild(bubble);
  return div;
}

function renderHintPanel() {
  const box = document.getElementById('hint-transcript');
  if (!box) return;
  box.innerHTML = '';
  hintLog.forEach((text, i) => {
    box.appendChild(buildHintPanelMsg(text, i + 1));
  });
  box.scrollTop = box.scrollHeight;
}

function toggleAccuseHints() {
  const drawer = document.getElementById('accuse-hints-drawer');
  const btn = document.getElementById('accuse-hint-btn');
  if (!drawer) return;
  const isOpen = drawer.style.display !== 'none';
  if (isOpen) {
    drawer.style.display = 'none';
    if (btn) btn.textContent = '💡 Hints';
  } else {
    // Populate list from hintLog
    const list = document.getElementById('accuse-hints-list');
    if (list) {
      list.innerHTML = '';
      hintLog.forEach((text, i) => {
        const item = document.createElement('div');
        item.style.cssText = 'font-size:13px;color:#a0c0e0;font-style:italic;line-height:1.5;padding:6px 0;border-bottom:1px solid #1a2030;';
        item.textContent = `${i + 1}. ${text}`;
        list.appendChild(item);
      });
    }
    drawer.style.display = 'block';
    if (btn) btn.textContent = '💡 Hide hints';
  }
}

function updateHintUI() {
  const firstCta = document.getElementById('hint-panel-cta');
  const toolbarBtn = document.getElementById('hint-toolbar-btn');
  const exhausted = hintsExhausted || (maxHints > 0 && hintLog.length >= maxHints);

  if (firstCta) firstCta.style.display = 'none';

  if (toolbarBtn) {
    toolbarBtn.style.display = '';
    toolbarBtn.disabled = caseReadOnly || exhausted;
    if (exhausted) {
      toolbarBtn.textContent = 'No more hints';
      toolbarBtn.title = 'All hints for this case have been used.';
    } else {
      toolbarBtn.textContent = '💡 Hint';
      const left = maxHints - hintLog.length;
      toolbarBtn.title = left > 0 ? `${left} hint${left === 1 ? '' : 's'} left` : '';
    }
  }
}

function releaseCaseReadOnlyUI() {
  caseReadOnly = false;
  const inputArea = document.querySelector('.input-area');
  if (inputArea) inputArea.classList.remove('read-only');
  const msgInput = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  if (msgInput) {
    msgInput.disabled = false;
    msgInput.placeholder = 'Ask a question…';
  }
  if (sendBtn) sendBtn.disabled = false;
  document.querySelectorAll('.action-row .action-btn').forEach((b) => { b.disabled = false; });
  updateHintUI();
  updateAccuseButton();
}

function applyCaseReadOnlyUI() {
  caseReadOnly = true;
  const inputArea = document.querySelector('.input-area');
  if (inputArea) inputArea.classList.add('read-only');
  const msgInput = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  if (msgInput) {
    msgInput.disabled = true;
    msgInput.placeholder = 'Case closed — transcripts below are read-only.';
  }
  if (sendBtn) sendBtn.disabled = true;
  document.querySelectorAll('.action-row .action-btn').forEach((b) => { b.disabled = true; });
  updateHintUI();
}

function dismissSolvedSummaryReadChat() {
  document.getElementById('solved-overlay').classList.remove('show');
  applyCaseReadOnlyUI();
  // Add the Accusation Hearing tab if there is a saved accusation transcript
  if (savedAccusationLines && savedAccusationLines.length > 0) {
    addAccusationTab();
  }
}

function addAccusationTab() {
  const tabs = document.getElementById('suspect-tabs');
  if (!tabs) return;
  // Don't add duplicate
  if (tabs.querySelector('[data-tab="accusation"]')) return;

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'suspect-tab suspect-tab--accusation';
  tab.dataset.tab = 'accusation';
  tab.textContent = '⚖ Hearing';
  tab.title = `Accusation hearing: vs ${savedAccusationTarget}`;
  tab.onclick = () => showAccusationTab();
  tabs.appendChild(tab);
}

function showAccusationTab() {
  // Deactivate all other tabs
  document.querySelectorAll('.suspect-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector('[data-tab="accusation"]');
  if (tab) tab.classList.add('active');

  // Switch panel to accusation transcript view
  const mainPanel = document.getElementById('chat-panel-main');
  const hintsPanel = document.getElementById('chat-panel-hints');
  if (mainPanel) mainPanel.classList.remove('is-active');
  if (hintsPanel) hintsPanel.classList.remove('is-active');

  // Build / refresh the accusation panel
  let accusPanel = document.getElementById('chat-panel-accusation');
  if (!accusPanel) {
    accusPanel = document.createElement('div');
    accusPanel.id = 'chat-panel-accusation';
    accusPanel.className = 'chat-panel-stack';
    const chatView = document.querySelector('.chat-view');
    if (chatView) chatView.appendChild(accusPanel);
  }

  accusPanel.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'chat-panel-heading';
  heading.textContent = `Accusation Hearing — vs ${savedAccusationTarget}`;
  accusPanel.appendChild(heading);

  const box = document.createElement('div');
  box.className = 'transcript';

  (savedAccusationLines || []).forEach(({ role, text }) => {
    const div = document.createElement('div');
    if (role === 'player') {
      div.className = 'msg player accuse';
      const lbl = document.createElement('div');
      lbl.className = 'msg-label';
      lbl.textContent = `Det. ${playerName}`;
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.textContent = text;
      div.appendChild(lbl);
      div.appendChild(bubble);
    } else if (role === 'confess') {
      div.className = 'msg suspect confess-final';
      const lbl = document.createElement('div');
      lbl.className = 'msg-label';
      lbl.textContent = `${savedAccusationTarget} — confession`;
      lbl.style.color = 'var(--gold)';
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.style.cssText = 'border-color: var(--gold); color: #f2ead8; background: #2a1e0a;';
      bubble.textContent = text;
      div.appendChild(lbl);
      div.appendChild(bubble);
    } else {
      div.className = 'msg suspect';
      const lbl = document.createElement('div');
      lbl.className = 'msg-label';
      lbl.textContent = savedAccusationTarget;
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.textContent = text;
      div.appendChild(lbl);
      div.appendChild(bubble);
    }
    box.appendChild(div);
  });

  accusPanel.appendChild(box);
  accusPanel.classList.add('is-active');
  box.scrollTop = box.scrollHeight;
}

function clearAccusationIntervalOnly() {
  if (accusationTimerId != null) {
    clearInterval(accusationTimerId);
    accusationTimerId = null;
  }
}

function clearAccusationTimer() {
  clearAccusationIntervalOnly();
  accusationTrialEndMs = null;
}

function updateAccuseButton() {
  const b = document.querySelector('.accuse-btn');
  if (b) b.disabled = caseReadOnly || accusationConsumed;
}

function openAccuse() {
  if (caseReadOnly || accusationConsumed) return;
  clearError('accuse-confirm-error');
  document.getElementById('accuse-select').value = currentSuspect;
  document.getElementById('accuse-panel-confirm').style.display = 'flex';
}

function closeAccuseConfirm() {
  document.getElementById('accuse-panel-confirm').style.display = 'none';
}

async function confirmAccusationBegin() {
  clearError('accuse-confirm-error');
  const name = document.getElementById('accuse-select').value;
  const buttons = document.querySelectorAll('#accuse-panel-confirm button');
  buttons.forEach((x) => { x.disabled = true; });
  try {
    const res = await fetch(`${API}/accuse/begin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, suspect_name: name }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    accusationConsumed = true;
    updateAccuseButton();
    document.getElementById('accuse-panel-confirm').style.display = 'none';
    openAccuseTrial(name, data.deadline_ms);
  } catch (e) {
    showError('accuse-confirm-error', e.message);
  }
  buttons.forEach((x) => { x.disabled = false; });
}

function openAccuseTrial(suspectName, deadlineMs) {
  accusationTargetName = suspectName;
  accusationTrialLines = [];
  document.getElementById('accuse-trial-title').textContent = `vs ${suspectName}`;
  document.getElementById('accuse-trial-transcript').innerHTML = '';
  document.getElementById('accuse-trial-input').value = '';
  clearError('accuse-trial-error');
  clearAccusationIntervalOnly();
  accusationTrialEndMs = Date.now() + deadlineMs;
  accusationSubmitting = false;
  // Swap: hide normal interrogation view, show accusation panel
  document.getElementById('interrogation-view').style.display = 'none';
  document.getElementById('accuse-panel-trial').style.display = 'flex';
  // Reset hints drawer
  const drawer = document.getElementById('accuse-hints-drawer');
  const hintBtn = document.getElementById('accuse-hint-btn');
  if (drawer) drawer.style.display = 'none';
  if (hintBtn) hintBtn.textContent = '💡 Hints';
  // Hide hint button if no hints have been used
  if (hintBtn) hintBtn.style.display = hintLog.length > 0 ? '' : 'none';
  setAccuseTrialInputEnabled(true);
  accusationTimerId = setInterval(tickAccusationTimer, 250);
  tickAccusationTimer();
}

function setAccuseTrialInputEnabled(on) {
  const inp = document.getElementById('accuse-trial-input');
  const send = document.getElementById('accuse-trial-send-btn');
  if (inp) inp.disabled = !on;
  if (send) send.disabled = !on;
  const footer = document.querySelector('.accuse-trial-footer .action-btn');
  if (footer) footer.disabled = !on;
}

function tickAccusationTimer() {
  const el = document.getElementById('accuse-timer');
  if (!accusationTrialEndMs || !el) return;
  const left = accusationTrialEndMs - Date.now();
  const s = Math.max(0, Math.ceil(left / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  el.textContent = `${m}:${String(sec).padStart(2, '0')}`;
  el.classList.toggle('accuse-timer--warn', s <= 15 && s > 0);
  if (left <= 0) {
    clearAccusationTimer();
    setAccuseTrialInputEnabled(false);
    if (!accusationSubmitting) accusationOnTimeExpired();
  }
}

function renderAccuseTrialLine(role, text) {
  const box = document.getElementById('accuse-trial-transcript');
  const div = document.createElement('div');
  div.className = `accuse-trial-msg ${role === 'player' ? 'player' : 'suspect'}`;
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.textContent = role === 'player' ? `Det. ${playerName}` : accusationTargetName;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  div.appendChild(lbl);
  div.appendChild(bubble);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

/** Typewriter effect for suspect replies inside the accusation transcript. */
function renderAccuseTrialLineTyped(role, text) {
  const box = document.getElementById('accuse-trial-transcript');
  const div = document.createElement('div');
  div.className = `accuse-trial-msg ${role === 'player' ? 'player' : role === 'confess' ? 'suspect confess' : 'suspect'}`;
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  if (role === 'confess') {
    lbl.textContent = `${accusationTargetName} — confession`;
    lbl.style.color = 'var(--gold)';
  } else {
    lbl.textContent = role === 'player' ? `Det. ${playerName}` : accusationTargetName;
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'confess') {
    bubble.style.cssText = 'border-color: var(--gold); color: #f2ead8; background: #2a1e0a;';
  }
  div.appendChild(lbl);
  div.appendChild(bubble);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  const CHARS_PER_SEC = text.length > 200 ? 55 : 38;
  const INTERVAL_MS = 1000 / CHARS_PER_SEC;

  return new Promise(resolve => {
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.textContent = '▍';
    bubble.appendChild(cursor);
    const tick = setInterval(() => {
      if (i < text.length) {
        cursor.insertAdjacentText('beforebegin', text[i]);
        i++;
        box.scrollTop = box.scrollHeight;
      } else {
        clearInterval(tick);
        cursor.remove();
        resolve();
      }
    }, INTERVAL_MS);
  });
}

async function sendAccusationTrialMessage() {
  if (accusationSubmitting) return;
  const input = document.getElementById('accuse-trial-input');
  const msg = input.value.trim();
  if (!msg) return;
  if (accusationTrialEndMs != null && accusationTrialEndMs - Date.now() <= 0) return;
  input.value = '';
  clearError('accuse-trial-error');
  accusationSubmitting = true;
  setAccuseTrialInputEnabled(false);

  // 1. Show player's statement immediately
  accusationTrialLines.push({ role: 'player', text: msg });
  renderAccuseTrialLine('player', msg);

  try {
    const res = await fetch(`${API}/accuse/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message: msg }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (data.won) {
      // 2a. Judge convinced — show confession typed in accusation chat, then solved overlay
      clearAccusationTimer();
      if (data.confession_reply) {
        accusationTrialLines.push({ role: 'confess', text: data.confession_reply });
        await renderAccuseTrialLineTyped('confess', data.confession_reply);
      }
      await finalizeAccusationOutcome({
        won: true,
        solution: data.solution,
        abandoned: false,
      });
    } else {
      // 2b. Not yet convinced — type suspect's reply in accusation chat
      if (data.reply) {
        accusationTrialLines.push({ role: 'suspect', text: data.reply });
        await renderAccuseTrialLineTyped('suspect', data.reply);
      }
      setAccuseTrialInputEnabled(true);
    }
  } catch (e) {
    showError('accuse-trial-error', e.message);
    setAccuseTrialInputEnabled(true);
  } finally {
    accusationSubmitting = false;
  }
}

function handleAccuseTrialKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAccusationTrialMessage();
  }
}

async function accusationOnTimeExpired() {
  if (accusationSubmitting) return;
  accusationSubmitting = true;
  clearAccusationTimer();
  setAccuseTrialInputEnabled(false);
  clearError('accuse-trial-error');
  try {
    const res = await fetch(`${API}/accuse/timeout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await finalizeAccusationOutcome({
      won: data.won,
      solution: data.solution,
      abandoned: false,
    });
  } catch (e) {
    showError('accuse-trial-error', e.message);
  } finally {
    accusationSubmitting = false;
  }
}

async function abandonAccusationHearing() {
  if (accusationSubmitting) return;
  if (!confirm('Give up on this accusation? You will lose the case.')) return;
  accusationSubmitting = true;
  clearAccusationTimer();
  setAccuseTrialInputEnabled(false);
  clearError('accuse-trial-error');
  try {
    const res = await fetch(`${API}/accuse/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await finalizeAccusationOutcome(data);
  } catch (e) {
    showError('accuse-trial-error', e.message);
    setAccuseTrialInputEnabled(true);
  } finally {
    accusationSubmitting = false;
  }
}

async function finalizeAccusationOutcome(data) {
  // Save the accusation transcript for post-game reading
  if (accusationTrialLines.length > 0) {
    savedAccusationLines = [...accusationTrialLines];
    savedAccusationTarget = accusationTargetName;
  }

  // Restore interrogation view
  document.getElementById('accuse-panel-trial').style.display = 'none';
  document.getElementById('interrogation-view').style.display = '';
  clearAccusationTimer();

  if (data.abandoned) {
    showSolved(data.solution, false, false, 'accusation_abandon');
    return;
  }

  // Append a brief hearing-closed marker into the suspect's interrogation transcript
  if (accusationTargetName) {
    switchSuspect(accusationTargetName);
    addMsg(accusationTargetName, 'system',
      data.won
        ? '— Accusation sustained — see hearing transcript above —'
        : '— Accusation not proven — hearing closed —',
      'talk');
  }

  const lostReason = data.won ? undefined : 'accusation_fail';
  showSolved(data.solution, data.won, false, lostReason);
}

// ===== ACTIONS =====
async function sendTalk() {
  if (caseReadOnly) return;
  const input = document.getElementById('msg-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  setLoading(true);
  clearError('game-error');

  addMsg(currentSuspect, 'player', msg, 'talk');

  const suspect = currentSuspect;
  try {
    const data = await withRetry(
      async () => {
        const res = await fetch(`${API}/talk`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ session_id: sessionId, suspect_name: suspect, message: msg })
        });
        const d = await res.json();
        if (d.error) throw new Error(d.error);
        return d;
      },
      3,
      (attempt, err) => {
        if (err) showError('game-error', `Attempt ${attempt-1}/3 failed: ${err} — retrying…`);
        else if (attempt > 1) showError('game-error', `Retrying… (${attempt}/3)`);
      }
    );
    clearError('game-error');
    await addMsgTyped(suspect, 'suspect', data.reply, 'talk');
  } catch (e) {
    showError('game-error', `Failed after 3 attempts: ${e.message}`);
  }
  setLoading(false);
}

function openPostConfessionContinueGate(solution, won) {
  pendingSolvedPayload = { solution, won };
  const gate = document.getElementById('post-confession-gate');
  if (gate) gate.classList.add('show');
}

function dismissPostConfessionGate() {
  const gate = document.getElementById('post-confession-gate');
  if (gate) gate.classList.remove('show');
  if (pendingSolvedPayload) {
    showSolved(pendingSolvedPayload.solution, pendingSolvedPayload.won);
    pendingSolvedPayload = null;
  }
}

function handlePostConfessionBackdropClick(e) {
  if (e.target === document.getElementById('post-confession-gate')) {
    dismissPostConfessionGate();
  }
}

async function getHint() {
  if (caseReadOnly) return;
  if (hintsExhausted || (maxHints > 0 && hintLog.length >= maxHints)) return;
  try {
    const data = await withRetry(
      async () => {
        const res = await fetch(`${API}/hint`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ session_id: sessionId })
        });
        const d = await res.json();
        if (d.exhausted) return { exhausted: true };
        if (d.error) throw new Error(d.error);
        return d;
      },
      3,
      (attempt, err) => {
        if (err) showError('game-error', `Hint attempt ${attempt-1}/3 failed: ${err} — retrying…`);
      }
    );
    clearError('game-error');
    if (data.exhausted) {
      hintsExhausted = true;
      updateHintUI();
      return;
    }
    hintLog.push(data.hint);
    if (hintLog.length >= maxHints) hintsExhausted = true;
    renderHintPanel();
    showHintsChatTab();
    updateHintUI();
  } catch (e) {
    showError('game-error', `Failed after 3 attempts: ${e.message}`);
  }
}

async function giveUp() {
  if (!confirm('Give up and reveal the solution?')) return;
  clearGameTimer();
  try {
    const res = await fetch(`${API}/give_up`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ session_id: sessionId })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showSolved(data.solution, false);
  } catch (e) {
    showError('game-error', e.message);
  }
}

function showSolved(solution, won, timeUp, lostReason) {
  clearGameTimer();
  let stamp = 'Case Closed';
  if (!won) {
    if (timeUp) stamp = "Time's Up";
    else if (lostReason === 'accusation_abandon') stamp = 'Accusation withdrawn';
    else if (lostReason === 'accusation_fail') stamp = 'Not proven';
    else stamp = 'You Gave Up';
  }
  document.getElementById('solved-stamp').textContent = stamp;
  document.getElementById('solved-headline').textContent = won ? 'Solved.' : 'The Truth.';
  document.getElementById('sol-culprit').textContent = solution.culprit;
  document.getElementById('sol-motive').textContent = solution.motive;
  document.getElementById('sol-method').textContent = solution.method;
  const wonActions = document.getElementById('solved-actions-won');
  const gaveUpActions = document.getElementById('solved-actions-gaveup');
  if (wonActions) wonActions.hidden = !won;
  if (gaveUpActions) gaveUpActions.hidden = won;
  setTimeout(() => {
    document.getElementById('solved-overlay').classList.add('show');
  }, 1000);
}

// ===== UTILS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setLoading(on) {
  document.getElementById('send-btn').disabled = on;
}

function showError(id, msg) {
  document.getElementById(id).textContent = msg;
}

function clearError(id) {
  document.getElementById(id).textContent = '';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTalk();
  }
}