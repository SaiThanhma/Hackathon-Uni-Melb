# Hackiethon-2026 | The Detective

This project was created for the Hackiethon 2026 at The University of Melbourne under the following theme:

**Theme**  
Designing and develop a game of any genre that incorporates a large language model (AI) as a component or mechanic of the game.

This is a browser-based detective roleplay game built with Flask. You investigate a mystery by questioning suspects, asking for hints, and making accusations until you solve the case.

## 🔍 The Detective — AI Mystery Game

An AI-generated browser-based mystery game. Every case — suspects, secrets, alibis, crime, solution — is freshly invented each play. No two games are the same.

---

## Quick Setup

**Requirements:** Python 3.9+, pip, a modern browser, a [Groq API key](https://console.groq.com)

```bash
# 1. Install dependencies
pip install flask flask-cors openai

# 2. Set your API key in config.py
API_KEY  = "gsk_YOUR_KEY_HERE"
BASE_URL = "https://api.groq.com/openai/v1"

# 3. Start the server
python server.py

# 4. Open in browser
http://localhost:5000
```

### Optional: Background Music
Drop `.mp3` / `.ogg` / `.wav` files into a `music/` folder next to `server.py`. Tracks play on shuffle automatically.

---

## How to Play

1. **Configure** — choose number of suspects (2–5), difficulty, time limit, and language
2. **Read the dossier** — case summary + persons of interest with circumstantial grounds for suspicion
3. **Interrogate** — question suspects freely; each remembers the full conversation. They can lie and evade
4. **Hints** — press 💡 for up to 5 progressive clues (vague tip → role → motive → method → name)
5. **Accuse** — you get **one accusation per case**. A 90-second timed hearing begins where you argue motive and method in a back-and-forth with the accused. The AI judge evaluates your argument live
6. **Win condition** — correctly name the culprit and clearly explain *why* (motive) and *how* (method). Bare accusations like "it was you" are rejected

---

## Configuration (`config.py`)

| Setting | Default | Description |
|---|---|---|
| `API_KEY` | — | Your Groq API key |
| `SETUP_MODEL` | `llama-3.3-70b-versatile` | Generates the case JSON |
| `CHARACTER_MODEL` | `llama-3.3-70b-versatile` | Powers suspect dialogue |
| `JUDGE_MODEL` | `llama-3.3-70b-versatile` | Evaluates accusation arguments |
| `N_PLAYER` | `3` | Default suspect count |
| `ACCUSATION_SECONDS` | `90` | Duration of the hearing |

All prompts live in `prompts.py`. Edit tone, difficulty instructions, or judge criteria there without touching other files.

---

## Key Technical Details

- **Sessions** are in-memory (lost on server restart) — intentional for local single-player use
- **Solution is never sent to the browser** — only revealed after a correct accusation or give-up
- **Confession token** — a cryptographic secret embedded in the culprit's system prompt; they only confess when the engine sends it after a verified win. Players cannot trick them into confessing early
- **Jailbreak defence** — server-side keyword filter blocks phrases like "who is the culprit" / "reveal the solution" / "ignore previous instructions" before they reach the model. Suspects are also instructed to refuse meta questions in-character
- **Accusation substance gate** — the judge's verdict is additionally filtered: argument must be >80 chars, contain substantive keywords (motive, method, evidence…), and not be a trivial phrase

---

## Architecture

The game utilizes a multi-agent orchestration of three LLM.

### 1. The Architect (`SETUP_MODEL`)
* **Purpose**: Generates the entire mystery universe—including setting, victim, and crime—as a structured JSON object.
* **Ground Truth**: Defines the hidden solution, including the culprit's identity, motive, and method, which is stored only on the server.
* **Asymmetry**: Assigns unique knowledge and secrets to each suspect, creating a web of partial information and red herrings.

### 2. The Suspects (`CHARACTER_MODEL`)
* **Purpose**: Powers interactive, in-character dialogues for all NPCs.
* **Dynamic Roleplay**: Each suspect reacts based on a unique dossier of personality traits, alibis, and relationships.
* **Confession Gate**: Culprits are hard-coded to deny all guilt until the engine sends a secret cryptographic "Confession Token" (`CONFESSION_AUTH`) only after a verified win.

### 3. The Arbiter (`JUDGE_MODEL`)
* **Purpose**: Evaluates the 90-second "Accusation Hearing" against the ground truth.
* **Win Criteria**: The Judge grants a win only if the player correctly identifies the culprit and provides a substantive explanation of both **motive** and **method**.
* **Anti-Trivialization**: Automatically rejects "lazy" accusations (e.g., "It was you!") that lack case-specific details or fail to meet minimum character/keyword thresholds.

---

## Troubleshooting

**Page doesn't load / strange behaviour → try a different browser first** (Chrome or Firefox recommended)

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: flask` | `pip install flask flask-cors openai` |
| Port 5000 in use | On macOS, disable AirPlay Receiver in System Settings, or change port in `server.py` to e.g. `5001` |
| Stuck on "Generating your case…" | Check DevTools → Network for a failing `/api/new_game` request; likely an invalid API key |
| `401 AuthenticationError` | Wrong or expired API key — regenerate at console.groq.com |
| `429 Rate limit` | Free Groq tier has per-minute limits — wait a moment and retry |
| Music won't play | Browsers block autoplay until user interaction — click the page first; ensure `music/` contains supported files |
| Judge keeps rejecting correct accusation | Name the suspect explicitly and explain *both* motive and method in concrete terms tied to the case facts |

---

## File Overview

```
server.py       — Flask REST API, session management
game_logic.py   — Case generation, LLM calls, accusation logic
prompts.py      — All model prompts and templates
config.py       — API key, model names, constants
index.html      — Single-page app shell
script.js       — Client-side state, UI, timers
music/          — (optional) audio tracks for background music
```