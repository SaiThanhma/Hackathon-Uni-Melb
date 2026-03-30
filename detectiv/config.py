# =============================================================================
# config.py — API credentials, model names, and runtime constants
#
# Change model names or the API key here without touching any other file.
# =============================================================================

# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------
API_KEY  = "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"
BASE_URL = "https://api.groq.com/openai/v1"

# ---------------------------------------------------------------------------
# Model names
#   SETUP_MODEL     — generates the full mystery case (JSON)
#   CHARACTER_MODEL — powers every suspect's in-character replies
#   JUDGE_MODEL     — evaluates the player's accusation argument
# ---------------------------------------------------------------------------
SETUP_MODEL     = "openai/gpt-oss-20b"
CHARACTER_MODEL = "openai/gpt-oss-20b"
JUDGE_MODEL     = "openai/gpt-oss-20b"

# ---------------------------------------------------------------------------
# Game constants
# ---------------------------------------------------------------------------

# Default number of suspects when the client doesn't specify
N_PLAYER = 3

# How long (seconds) the formal accusation hearing lasts
ACCUSATION_SECONDS = 90