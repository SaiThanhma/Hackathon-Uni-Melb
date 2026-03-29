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
  } catch (e) {
    document.getElementById('intro-error').textContent = `Failed after 3 attempts: ${e.message}`;
    document.getElementById('btn-start').disabled = false;
  }
  document.getElementById('loading-intro').style.display = 'none';
}

function enterGame() {
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
}


function switchSuspect(name) {
  currentSuspect = name;

  document.querySelectorAll('.suspect-tab').forEach(t => {
    if (t.dataset.tab === 'hints') {
      t.classList.remove('active');
    } else {
      t.classList.toggle('active', t.dataset.name === name);
    }
  });

  const mainPanel = document.getElementById('chat-panel-main');
  const hintsPanel = document.getElementById('chat-panel-hints');
  if (mainPanel) mainPanel.classList.add('is-active');
  if (hintsPanel) hintsPanel.classList.remove('is-active');

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
  if (mainPanel) mainPanel.classList.remove('is-active');
  if (hintsPanel) hintsPanel.classList.add('is-active');
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
    addMsg(suspect, 'suspect', data.reply, 'talk');
  } catch (e) {
    showError('game-error', `Failed after 3 attempts: ${e.message}`);
  }
  setLoading(false);
}

function openAccuse() {
  if (caseReadOnly) return;
  document.getElementById('accuse-select').value = currentSuspect;
  document.getElementById('accuse-input').value = '';
  document.getElementById('accuse-error').textContent = '';
  document.getElementById('accuse-panel').style.display = 'flex';
}

function closeAccuse() {
  document.getElementById('accuse-panel').style.display = 'none';
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

function accusationHasSubstance(text) {
  if (text.length < 40) return false;
  const clauses = text.split(/[.,;!?\n]+/).map(s => s.trim()).filter(s => s.length > 4);
  return clauses.length >= 2;
}

async function submitAccusation() {
  const name = document.getElementById('accuse-select').value;
  const arg = document.getElementById('accuse-input').value.trim();
  if (!arg) { showError('accuse-error', 'State your argument.'); return; }
  if (!accusationHasSubstance(arg)) {
    showError('accuse-error', 'Your accusation needs more — explain both the motive (why they did it) and the method (how they did it).');
    return;
  }

  closeAccuse();
  setLoading(true);

  switchSuspect(name);
  addMsg(name, 'player', `I accuse you: ${arg}`, 'accuse');

  try {
    const data = await withRetry(
      async () => {
        const res = await fetch(`${API}/accuse`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ session_id: sessionId, suspect_name: name, argument: arg })
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
    addMsg(name, 'suspect', data.reply, 'accuse');
    if (data.solved) {
      clearGameTimer();
      if (data.confession_reply) {
        addMsg(name, 'suspect', data.confession_reply, 'confess');
        showSolved(data.solution, true);
      } else {
        showSolved(data.solution, true);
      }
    }
  } catch (e) {
    showError('game-error', `Failed after 3 attempts: ${e.message}`);
  }
  setLoading(false);
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

function showSolved(solution, won, timeUp) {
  clearGameTimer();
  document.getElementById('solved-stamp').textContent = won
    ? 'Case Closed'
    : (timeUp ? "Time's Up" : 'You Gave Up');
  document.getElementById('solved-headline').textContent = won ? 'Solved.' : 'The Truth.';
  document.getElementById('sol-culprit').textContent = solution.culprit;
  document.getElementById('sol-motive').textContent = solution.motive;
  document.getElementById('sol-method').textContent = solution.method;
  const wonActions = document.getElementById('solved-actions-won');
  const gaveUpActions = document.getElementById('solved-actions-gaveup');
  if (wonActions) wonActions.hidden = !won;
  if (gaveUpActions) gaveUpActions.hidden = won;
  document.getElementById('solved-overlay').classList.add('show');
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