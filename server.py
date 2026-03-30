import os
import time
import uuid
from typing import Any, Dict, List

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
from openai import OpenAI

from config import API_KEY, BASE_URL
from game_logic import (
    ACCUSATION_SECONDS,
    N_PLAYER,
    META_JAILBREAK_ACCUSE_REPLY,
    META_JAILBREAK_TALK_REPLY,
    build_hint,
    build_initial_conversations,
    build_accusation_phase_system_prompt,
    character_completion,
    evaluate_accusation_dialogue_with_ai,
    format_accusation_dialogue_for_judge,
    generate_detective_case,
    get_interrogation_tips,
    hint_total_for_case,
    is_meta_or_jailbreak,
    issue_culprit_confession_token,
    merge_accusation_dialogue_into_convo,
    run_post_judge_confession,
)

app = Flask(__name__, static_folder=".")
CORS(app)

# Background music: place audio files in `music/` next to this file.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MUSIC_DIR = os.path.join(_BASE_DIR, "music")
MUSIC_DIR_NESTED = os.path.join(_BASE_DIR, "music")
_MUSIC_EXTENSIONS = {".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac", ".webm", ".opus"}


def _music_directories() -> List[str]:
    """Ordered search paths; primary `music/` wins if the same filename exists twice."""
    out: List[str] = []
    for d in (MUSIC_DIR, MUSIC_DIR_NESTED):
        if os.path.isdir(d) and d not in out:
            out.append(d)
    return out

# =========================
# Client setup
# =========================
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

# In-memory session store: session_id -> game state
sessions: Dict[str, Dict[str, Any]] = {}


# =========================
# API Routes
# =========================

@app.route("/api/new_game", methods=["POST"])
def new_game():
    body = request.json or {}
    n_players = int(body.get("n_players", N_PLAYER))
    difficulty = body.get("difficulty", "normal")
    language = body.get("language", "English")

    if not 2 <= n_players <= 5:
        return jsonify({"error": "n_players must be between 2 and 5"}), 400
    if difficulty not in ("easy", "normal", "hard"):
        difficulty = "normal"

    try:
        case_data = generate_detective_case(client, n_players, difficulty, language)
        case_data["language"] = language
        case_data["difficulty"] = difficulty
        case_data["culprit_confession_token"] = issue_culprit_confession_token()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "case_data": case_data,
        "conversations": build_initial_conversations(case_data),
        "hint_count": 0,
        "solved": False,
        "language": language,
        "difficulty": difficulty,
        "accusation_used": False,
        "accusation_active": False,
        "accusation_target": None,
        "accusation_started_at": None,
        "accusation_convo": None,
    }

    max_hints = hint_total_for_case(case_data)

    return jsonify({
        "session_id": session_id,
        "player_name": case_data["player_name"],
        "title": case_data["title"],
        "setting": case_data["setting"],
        "victim": case_data["victim"],
        "crime": case_data["crime"],
        "pre_story": case_data["pre_story"],
        "suspects": [
            {
                "name": s["name"],
                "role": s["role"],
                "personality": s["personality"],
                "why_suspected": s["why_suspected"],
            }
            for s in case_data["suspects"]
        ],
        "max_hints": max_hints,
    })


@app.route("/api/talk", methods=["POST"])
def talk():
    data = request.json
    session_id = data.get("session_id")
    suspect_name = data.get("suspect_name")
    message = data.get("message", "")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    if session["solved"]:
        return jsonify({"error": "Case already solved"}), 400

    case_data = session["case_data"]
    suspect_names = [s["name"] for s in case_data["suspects"]]

    if suspect_name not in suspect_names:
        return jsonify({"error": "Unknown suspect"}), 400

    if is_meta_or_jailbreak(message):
        return jsonify({"reply": META_JAILBREAK_TALK_REPLY, "type": "talk"})

    convo = session["conversations"][suspect_name]
    convo.append({"role": "user", "content": f"The player is speaking to you normally.\n\nPlayer message:\n{message}\n\nRespond in character."})

    try:
        reply = character_completion(client, convo, 0.9)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    convo.append({"role": "assistant", "content": reply})
    return jsonify({"reply": reply, "type": "talk"})


@app.route("/api/tips", methods=["POST"])
def tips():
    """Return interrogation tips for a specific suspect."""
    data = request.json or {}
    session_id = data.get("session_id")
    suspect_name = data.get("suspect_name")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    case_data = session["case_data"]
    suspect_names = [s["name"] for s in case_data["suspects"]]

    if suspect_name not in suspect_names:
        return jsonify({"error": "Unknown suspect"}), 400

    tip_list = get_interrogation_tips(case_data, suspect_name)
    return jsonify({"tips": tip_list, "suspect_name": suspect_name})


@app.route("/api/accuse/begin", methods=["POST"])
def accuse_begin():
    data = request.json or {}
    session_id = data.get("session_id")
    suspect_name = data.get("suspect_name")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    if session["solved"]:
        return jsonify({"error": "Case already solved"}), 400
    if session["accusation_used"]:
        return jsonify({"error": "You have already used your one accusation for this case."}), 400
    if session.get("accusation_active"):
        return jsonify({"error": "An accusation is already in progress."}), 400

    case_data = session["case_data"]
    suspect_names = [s["name"] for s in case_data["suspects"]]
    if suspect_name not in suspect_names:
        return jsonify({"error": "Unknown suspect"}), 400

    suspect = next(s for s in case_data["suspects"] if s["name"] == suspect_name)
    session["accusation_used"] = True
    session["accusation_active"] = True
    session["accusation_target"] = suspect_name
    session["accusation_started_at"] = time.time()
    session["accusation_convo"] = [
        {"role": "system", "content": build_accusation_phase_system_prompt(case_data, suspect)},
    ]

    return jsonify({
        "deadline_ms": int(ACCUSATION_SECONDS * 1000),
        "seconds": ACCUSATION_SECONDS,
        "suspect_name": suspect_name,
    })


@app.route("/api/accuse/message", methods=["POST"])
def accuse_message():
    data = request.json or {}
    session_id = data.get("session_id")
    message = (data.get("message") or "").strip()

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    if not session.get("accusation_active"):
        return jsonify({"error": "No active accusation hearing."}), 400
    if session["solved"]:
        return jsonify({"error": "Case already solved"}), 400

    if not message:
        return jsonify({"error": "Message is empty."}), 400

    if is_meta_or_jailbreak(message):
        return jsonify({"reply": META_JAILBREAK_ACCUSE_REPLY, "won": False})

    elapsed = time.time() - float(session["accusation_started_at"])
    if elapsed > ACCUSATION_SECONDS + 1.0:
        return jsonify({"error": "Time is up."}), 400

    case_data = session["case_data"]
    suspect_name = session["accusation_target"]
    convo = session["accusation_convo"]
    assert suspect_name and convo is not None

    # Step 1 — add player's message to conversation
    convo.append({"role": "user", "content": message})

    # Step 2 — judge evaluates after player's statement (before suspect replies)
    transcript = format_accusation_dialogue_for_judge(convo)
    try:
        judge = evaluate_accusation_dialogue_with_ai(
            client, case_data, suspect_name, transcript, messages=convo,
        )
    except Exception as e:
        convo.pop()
        return jsonify({"error": str(e)}), 500

    if judge.get("player_wins"):
        # Judge convinced — skip suspect reply, go straight to confession
        session["accusation_active"] = False
        session["solved"] = True
        main_convo = session["conversations"][suspect_name]
        merge_accusation_dialogue_into_convo(main_convo, convo)
        try:
            confession = run_post_judge_confession(client, main_convo, case_data, suspect_name)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        return jsonify({
            "won": True,
            "solution": case_data["solution"],
            "confession_reply": confession,
            "judge_reason": judge.get("reason", ""),
        })

    # Step 3 — judge not convinced: generate suspect's reply
    try:
        reply = character_completion(client, convo, 0.78)
    except Exception as e:
        convo.pop()
        return jsonify({"error": str(e)}), 500

    convo.append({"role": "assistant", "content": reply})
    return jsonify({"reply": reply, "won": False})


@app.route("/api/accuse/timeout", methods=["POST"])
def accuse_timeout():
    """When the timer hits zero: run JUDGE_MODEL once on the full dialogue; if not winning, player loses."""
    data = request.json or {}
    session_id = data.get("session_id")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    if not session.get("accusation_active"):
        return jsonify({"error": "No active accusation."}), 400

    case_data = session["case_data"]
    suspect_name = session["accusation_target"]
    convo = session["accusation_convo"]
    assert suspect_name and convo is not None

    transcript = format_accusation_dialogue_for_judge(convo)

    try:
        judge = evaluate_accusation_dialogue_with_ai(
            client, case_data, suspect_name, transcript, messages=convo,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    session["accusation_active"] = False
    main_convo = session["conversations"][suspect_name]

    if judge.get("player_wins"):
        merge_accusation_dialogue_into_convo(main_convo, convo)
        try:
            confession = run_post_judge_confession(client, main_convo, case_data, suspect_name)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        session["solved"] = True
        return jsonify({
            "won": True,
            "solution": case_data["solution"],
            "confession_reply": confession,
            "judge_reason": judge.get("reason", ""),
            "dialogue_transcript": transcript,
        })

    session["solved"] = True
    return jsonify({
        "won": False,
        "solution": case_data["solution"],
        "judge_reason": judge.get("reason", ""),
        "dialogue_transcript": transcript,
    })


@app.route("/api/accuse/abandon", methods=["POST"])
def accuse_abandon():
    data = request.json or {}
    session_id = data.get("session_id")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    if not session.get("accusation_active"):
        return jsonify({"error": "No active accusation to abandon."}), 400

    session["accusation_active"] = False
    session["solved"] = True
    case_data = session["case_data"]

    return jsonify({
        "solved": True,
        "won": False,
        "abandoned": True,
        "solution": case_data["solution"],
    })


@app.route("/api/hint", methods=["POST"])
def hint():
    data = request.json
    session_id = data.get("session_id")
    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    case_data = session["case_data"]
    hint_index = session["hint_count"]
    total = hint_total_for_case(case_data)

    if hint_index >= total:
        return jsonify({"exhausted": True})

    try:
        hint_text = build_hint(client, case_data, hint_index)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if hint_text is None:
        return jsonify({"exhausted": True})

    session["hint_count"] += 1
    return jsonify({
        "hint": hint_text,
        "hint_number": hint_index + 1,
        "hints_remaining": total - session["hint_count"],
    })


@app.route("/api/give_up", methods=["POST"])
def give_up():
    data = request.json
    session_id = data.get("session_id")
    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    session["solved"] = True
    solution = session["case_data"]["solution"]
    return jsonify({"solution": solution})


def _list_music_tracks() -> List[str]:
    seen = set()
    out: List[str] = []
    for music_root in _music_directories():
        for name in os.listdir(music_root):
            if name in seen:
                continue
            path = os.path.join(music_root, name)
            if os.path.isfile(path) and os.path.splitext(name)[1].lower() in _MUSIC_EXTENSIONS:
                seen.add(name)
                out.append(name)
    out.sort()
    return out


@app.route("/api/music/tracks", methods=["GET"])
def music_tracks():
    return jsonify({"tracks": _list_music_tracks()})


@app.route("/music/<path:filename>")
def serve_music(filename: str):
    # Only top-level files, no path traversal
    base = os.path.basename(filename)
    if not base or base != filename:
        abort(404)
    for music_root in _music_directories():
        path = os.path.join(music_root, base)
        if os.path.isfile(path):
            return send_from_directory(music_root, base)
    abort(404)


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/styles.css")
def styles():
    return send_from_directory(".", "styles.css")


@app.route("/script.js")
def script():
    return send_from_directory(".", "script.js")


if __name__ == "__main__":
    print("Detective Game running at http://localhost:5000")
    app.run(debug=True, port=5000)