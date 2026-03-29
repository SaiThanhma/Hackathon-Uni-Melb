import uuid
from typing import Any, Dict

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from openai import OpenAI

from game_logic import (
    N_PLAYER,
    META_JAILBREAK_ACCUSE_REPLY,
    META_JAILBREAK_TALK_REPLY,
    build_hint,
    build_initial_conversations,
    character_completion,
    evaluate_accusation_with_ai,
    generate_detective_case,
    hint_total_for_case,
    is_meta_or_jailbreak,
    issue_culprit_confession_token,
    run_accusation_turn,
)

app = Flask(__name__, static_folder=".")
CORS(app)

# =========================
# Client setup
# =========================
client = OpenAI(
    api_key="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",
    base_url="https://api.groq.com/openai/v1",
)

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
    }

    return jsonify({
        "session_id": session_id,
        "player_name": case_data["player_name"],
        "title": case_data["title"],
        "setting": case_data["setting"],
        "victim": case_data["victim"],
        "crime": case_data["crime"],
        "pre_story": case_data["pre_story"],
        "suspects": [
            {"name": s["name"], "role": s["role"], "personality": s["personality"], "why_suspected": s["why_suspected"]}
            for s in case_data["suspects"]
        ],
        "max_hints": hint_total_for_case(case_data),
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


@app.route("/api/accuse", methods=["POST"])
def accuse():
    data = request.json
    session_id = data.get("session_id")
    suspect_name = data.get("suspect_name")
    argument = data.get("argument", "")

    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    if session["solved"]:
        return jsonify({"error": "Case already solved"}), 400

    case_data = session["case_data"]
    suspect_names = [s["name"] for s in case_data["suspects"]]

    if suspect_name not in suspect_names:
        return jsonify({"error": "Unknown suspect"}), 400

    if is_meta_or_jailbreak(argument):
        return jsonify({"reply": META_JAILBREAK_ACCUSE_REPLY, "type": "accuse", "solved": False})

    judge_result = evaluate_accusation_with_ai(client, case_data, suspect_name, argument)
    should_confess = judge_result["should_confess"]

    convo = session["conversations"][suspect_name]
    try:
        out = run_accusation_turn(
            client, convo, case_data, suspect_name, argument, should_confess,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    result: Dict[str, Any] = {
        "reply": out["reply"],
        "type": "accuse",
        "solved": False,
    }
    if out.get("confession_reply"):
        result["confession_reply"] = out["confession_reply"]
    if out["session_solved"]:
        session["solved"] = True
        result["solved"] = True
        result["solution"] = case_data["solution"]

    return jsonify(result)


@app.route("/api/hint", methods=["POST"])
def hint():
    data = request.json
    session_id = data.get("session_id")
    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    hint_text = build_hint(session["case_data"], session["hint_count"])
    if hint_text is None:
        return jsonify({"exhausted": True})
    session["hint_count"] += 1
    return jsonify({"hint": hint_text})


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
