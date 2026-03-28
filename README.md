# Hackiethon-2026 | Detective Game

This project was created for the Hackiethon 2026 at The University of Melbourne under the following theme:

**Theme**  
Designing and develop a game of any genre that incorporates a large language model (AI) as a component or mechanic of the game.

This is a browser-based detective roleplay game built with Flask. You investigate a mystery by questioning suspects, asking for hints, and making accusations until you solve the case.

## Features

- Start a new detective case
- Talk to suspects in character
- Ask for hints if you get stuck
- Accuse a suspect and see whether you solved the mystery
- Give up and reveal the solution

## Requirements

This project uses the following Python packages:

- flask
- flask-cors
- openai

You can install them directly with pip or by using a `requirements.txt` file.

## Project Files

Make sure these files are in the same project folder:

- `server.py`
- `index.html`
- `styles.css`
- `script.js`

## Installation

### 1. Clone or download the project

Download the project files and place them in one folder on your computer.

### 2. Create a virtual environment

#### Windows
```bash
python -m venv venv
venv\Scripts\activate
```
#### macOS / Linux
```
python -m venv venv
source venv/bin/activate
```
### Install dependencies
pip install -r requirements.txt

### 3. Start the server
python server.py

### 4. Open the game in your browser
http://127.0.0.1:5000

## How the Game Works

When a new game starts, the backend asks an AI model to generate a full detective case in JSON format. The generated case includes the setting, victim, crime, suspect list, and hidden solution. The backend validates that the case is complete and makes sure exactly one suspect is guilty.

After that, the server creates a separate private prompt for each suspect and runs each suspect as its own AI model. Each suspect-model knows its own alibi, secret, and limited knowledge. The guilty suspect-model also knows the real motive and method, but is instructed not to confess unless the player makes a correct accusation.

During the game, the player talks to suspects, asks for hints, and can accuse someone. A separate judge AI model evaluates the accusation against the hidden solution. If the accusation matches the real solution, the judge-model confirms it, the culprit confesses, and the case is solved.

## Jailbreak Protection

The game includes a safeguard layer against jailbreak attempts and meta-prompt attacks. Before a player message is sent to a suspect model or the accusation system, the backend checks whether it contains suspicious instructions such as asking to break character, reveal the hidden solution, show the system prompt, or ignore previous instructions.

If such a message is detected, the backend does not process it normally. Instead, it returns a safe in-character response that preserves immersion while preventing prompt leakage. This ensures that suspects remain consistent with their assigned roles and that the hidden solution cannot be exposed through prompt injection or meta-gaming.