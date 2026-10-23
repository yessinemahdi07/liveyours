import os
import json
import re
import hmac
import math
import secrets
import threading
import time
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory, Response, session
from dotenv import load_dotenv
from urllib.parse import urlparse
from werkzeug.utils import secure_filename
from migrations import run_migrations
from liveyours.documents import DocumentLimits, extract_document_text as _extract_document_text, select_document_excerpt, sample_document_text
from liveyours.ai.providers import has_provider_key, request_completion

load_dotenv()
app = Flask(__name__, static_folder='frontend/dist')
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_DOCUMENT_PAGES = 50
MAX_STORED_DOCUMENT_CHARS = 30_000
MAX_SPREADSHEET_SHEETS = 12
MAX_SPREADSHEET_ROWS = 5_000
MAX_SPREADSHEET_COLUMNS = 64
MAX_SPREADSHEET_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_CHAT_ATTACHMENT_CHARS = 12_000
MAX_FLASHCARD_SOURCE_CHARS = 16_000
MAX_CHAT_HISTORY_CHARS = 6_000
MAX_CHAT_MESSAGE_CHARS = 10_000
# iPhone 13 photographs are about 12 MP; keep one full-resolution scan usable
# while limiting worst-case OCR memory on Render's small free instance.
MAX_IMAGE_PIXELS = 13_000_000
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_BYTES
APP_USERNAME = os.environ.get("APP_USERNAME", "liveyours")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
SESSION_SECRET_KEY = os.environ.get("SESSION_SECRET_KEY", "")
LOGIN_FAILURE_LIMIT = 10
LOGIN_FAILURE_WINDOW_SECONDS = 300
_login_failures: list[float] = []
_login_failures_lock = threading.Lock()
CLOUD_AI_FALLBACK = os.environ.get("CLOUD_AI_FALLBACK", "false").lower() in ("1", "true", "yes")
if os.environ.get("RENDER") == "true" and not APP_PASSWORD:
    raise RuntimeError("APP_PASSWORD must be configured before deploying LiveYours on Render")
if os.environ.get("RENDER") == "true" and not SESSION_SECRET_KEY:
    raise RuntimeError("SESSION_SECRET_KEY must be configured before deploying LiveYours on Render")

app.config.update(
    SECRET_KEY=SESSION_SECRET_KEY or secrets.token_urlsafe(48),
    SESSION_COOKIE_NAME="liveyours_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=os.environ.get("RENDER") == "true",
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    SESSION_REFRESH_EACH_REQUEST=False,
)


def request_is_local_development():
    hostname = (urlparse(f"//{request.host}").hostname or "").lower()
    return (
        not APP_PASSWORD
        and request.remote_addr in {"localhost", "127.0.0.1", "::1"}
        and hostname in {"localhost", "127.0.0.1", "::1"}
    )


def login_attempt_is_throttled():
    """Bound shared-account credential guessing for this single Gunicorn worker."""
    now = time.monotonic()
    with _login_failures_lock:
        _login_failures[:] = [
            attempt for attempt in _login_failures
            if now - attempt < LOGIN_FAILURE_WINDOW_SECONDS
        ]
        return len(_login_failures) >= LOGIN_FAILURE_LIMIT


def record_login_failure():
    now = time.monotonic()
    with _login_failures_lock:
        _login_failures[:] = [
            attempt for attempt in _login_failures
            if now - attempt < LOGIN_FAILURE_WINDOW_SECONDS
        ]
        _login_failures.append(now)


def clear_login_failures():
    with _login_failures_lock:
        _login_failures.clear()


def request_is_authenticated():
    if session.get("authenticated") is True:
        return True

    authorization = request.authorization
    if authorization is None:
        return request_is_local_development()
    if login_attempt_is_throttled():
        return False
    username_ok = authorization is not None and hmac.compare_digest(authorization.username or "", APP_USERNAME)
    password_ok = authorization is not None and bool(APP_PASSWORD) and hmac.compare_digest(authorization.password or "", APP_PASSWORD)
    if username_ok and password_ok:
        clear_login_failures()
        return True
    record_login_failure()
    return request_is_local_development()

@app.before_request
def require_dashboard_auth():
    if request.path in {"/healthz", "/api/auth/session", "/api/auth/login"}:
        return None
    # Serve the public application shell so the React sign-in screen can render.
    # All private data remains behind this check at the API boundary.
    if not request.path.startswith("/api/"):
        return None
    if request_is_authenticated():
        return None
    if not APP_PASSWORD and not request_is_local_development():
        return jsonify({"error": "Configure APP_PASSWORD before exposing LiveYours outside this device."}), 503
    return jsonify({"error": "Authentication required."}), 401


@app.route('/api/auth/session', methods=['GET'])
def get_auth_session():
    return jsonify({"authenticated": request_is_authenticated()})


@app.route('/api/auth/login', methods=['POST'])
def login():
    if not APP_PASSWORD:
        if request_is_local_development():
            session.clear()
            session.permanent = True
            session["authenticated"] = True
            return jsonify({"success": True})
        return jsonify({"error": "Sign-in is not configured for this server."}), 503

    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "Enter your username and password."}), 400

    if login_attempt_is_throttled():
        return jsonify({"error": "Too many sign-in attempts. Wait five minutes and try again."}), 429, {
            "Retry-After": str(LOGIN_FAILURE_WINDOW_SECONDS)
        }

    username_ok = hmac.compare_digest(username, APP_USERNAME)
    password_ok = hmac.compare_digest(password, APP_PASSWORD)
    if not (username_ok and password_ok):
        record_login_failure()
        return jsonify({"error": "That username or password is incorrect."}), 401

    clear_login_failures()
    session.clear()
    session.permanent = True
    session["authenticated"] = True
    return jsonify({"success": True})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.before_request
def protect_browser_mutations():
    if request.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("Origin")
        if not origin or (urlparse(origin).netloc.lower() != request.host.lower()):
            return jsonify({"error": "Cross-origin request rejected."}), 403
    return None

DATABASE_URL = os.environ.get("DATABASE_URL")
OMNIROUTE_URL = os.environ.get("OMNIROUTE_URL", "http://127.0.0.1:20128/v1/chat/completions")
OMNIROUTE_API_KEY = os.environ.get("OMNIROUTE_API_KEY", "omniroute-no-auth")
OMNIROUTE_HEADERS = {"Authorization": f"Bearer {OMNIROUTE_API_KEY}", "Content-Type": "application/json"}
FREELLMAPI_API_KEY = os.environ.get("FREELLMAPI_API_KEY", "")
FREELLMAPI_URL = os.environ.get("FREELLMAPI_URL", "http://127.0.0.1:3001/v1/chat/completions")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openrouter/free")
OPENROUTER_HEADERS = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
BYTEZ_API_KEY = os.environ.get("BYTEZ_API_KEY", "")
BYTEZ_URL = "https://api.bytez.com/models/v2/openai/v1/chat/completions"
BYTEZ_MODEL = os.environ.get("BYTEZ_MODEL", "Qwen/Qwen3-4B")
BYTEZ_ENABLED = os.environ.get("BYTEZ_ENABLED", "false").lower() in ("1", "true", "yes")
LLM7_API_KEY = os.environ.get("LLM7_API_KEY", "")
LLM7_URL = "https://api.llm7.io/v1/chat/completions"
LLM7_MODEL = os.environ.get("LLM7_MODEL", "gpt-4o-mini-2024-07-18")
GOOGLE_AI_STUDIO_API_KEY = os.environ.get("GOOGLE_AI_STUDIO_API_KEY", "")
GOOGLE_AI_STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
GOOGLE_AI_STUDIO_MODEL = os.environ.get("GOOGLE_AI_STUDIO_MODEL", "models/gemini-3.1-flash-lite")
LIVEYOURS_COACH_PROFILE = os.environ.get("LIVEYOURS_COACH_PROFILE", "").strip()[:4000]

def request_ai(payload, timeout=30, coach_profile_context=""):
    """Compatibility boundary between Flask routes and the provider service."""
    return request_completion(
        payload,
        timeout,
        hosted=os.environ.get("RENDER") == "true",
        cloud_fallback=CLOUD_AI_FALLBACK,
        omni_url=OMNIROUTE_URL,
        omni_headers=OMNIROUTE_HEADERS,
        freellmapi_key=FREELLMAPI_API_KEY,
        freellmapi_url=FREELLMAPI_URL,
        openrouter_key=OPENROUTER_API_KEY,
        openrouter_url=OPENROUTER_URL,
        openrouter_headers=OPENROUTER_HEADERS,
        openrouter_model=OPENROUTER_MODEL,
        bytez_key=BYTEZ_API_KEY if BYTEZ_ENABLED else "",
        bytez_url=BYTEZ_URL,
        bytez_model=BYTEZ_MODEL,
        llm7_key=LLM7_API_KEY,
        llm7_url=LLM7_URL,
        llm7_model=LLM7_MODEL,
        google_ai_studio_key=GOOGLE_AI_STUDIO_API_KEY,
        google_ai_studio_url=GOOGLE_AI_STUDIO_URL,
        google_ai_studio_model=GOOGLE_AI_STUDIO_MODEL,
        logger=app.logger,
        coach_profile_context=coach_profile_context,
    )

def ai_unavailable_message():
    """Return a deployment-aware hint without exposing provider credentials."""
    if os.environ.get("RENDER") == "true":
        if not CLOUD_AI_FALLBACK:
            return (
                "Hosted AI is disabled. Render cannot reach OmniRoute at your PC's 127.0.0.1; "
                "enable CLOUD_AI_FALLBACK and configure a cloud AI key in Render."
            )
        hosted_keys = [GOOGLE_AI_STUDIO_API_KEY, OPENROUTER_API_KEY, LLM7_API_KEY]
        if BYTEZ_ENABLED:
            hosted_keys.append(BYTEZ_API_KEY)
        if not any(map(has_provider_key, hosted_keys)):
            providers = ["GOOGLE_AI_STUDIO_API_KEY", "OPENROUTER_API_KEY", "LLM7_API_KEY"]
            if BYTEZ_ENABLED:
                providers.insert(2, "BYTEZ_API_KEY")
            return f"Hosted AI needs a valid {', '.join(providers)} in Render. Your logs are still saved."
        return "AI providers are temporarily unavailable. Your logs are still saved; retry shortly."
    if FREELLMAPI_API_KEY:
        return "AI is unavailable. Check that OmniRoute and FreeLLMAPI are running and their configured providers are ready."
    return "AI is unavailable. Check that OmniRoute is running or configure the local FreeLLMAPI fallback."

def get_db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)



def extract_document_text(upload, filename):
    """Apply the configured upload budgets through the document service."""
    limits = DocumentLimits(
        upload_bytes=MAX_UPLOAD_BYTES,
        document_pages=MAX_DOCUMENT_PAGES,
        stored_document_chars=MAX_STORED_DOCUMENT_CHARS,
        spreadsheet_sheets=MAX_SPREADSHEET_SHEETS,
        spreadsheet_rows=MAX_SPREADSHEET_ROWS,
        spreadsheet_columns=MAX_SPREADSHEET_COLUMNS,
        spreadsheet_uncompressed_bytes=MAX_SPREADSHEET_UNCOMPRESSED_BYTES,
        image_pixels=MAX_IMAGE_PIXELS,
    )
    return _extract_document_text(upload, filename, limits)


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({"error": "API Route Not Found"}), 404
    return send_from_directory(app.static_folder, 'index.html')

@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "Upload is too large. The maximum request size is 20 MB."}), 413

@app.after_request
def set_cache_headers(response):
    # The HTML entry point must be revalidated so browsers pick up new hashed bundles.
    if response.mimetype == 'text/html':
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    elif request.path.startswith('/api/'):
        # API responses can contain private health, finance, and study data.
        # Keep browsers and intermediary caches from reusing them across sessions.
        response.headers['Cache-Control'] = 'no-store'
    elif request.path == '/service-worker.js':
        # Browsers must revalidate the worker script after a deployment so it
        # can activate the new cache version and evict stale hashed assets.
        response.headers['Cache-Control'] = 'no-cache'
    elif request.path.startswith('/assets/'):
        # Vite filenames are content-hashed, so these are safe to cache long term.
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    if os.environ.get("RENDER") == "true":
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/healthz')
def health_check():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return jsonify({"status": "ok"})
    except Exception:
        return jsonify({"status": "unavailable", "database": "unavailable"}), 503

@app.route('/api/privacy', methods=['GET'])
def privacy_settings():
    return jsonify({"cloud_ai_fallback": CLOUD_AI_FALLBACK, "ai_mode": "cloud-fallback" if CLOUD_AI_FALLBACK else "local-only"})

# --- TASKS ---
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY id ASC")
            return jsonify(cur.fetchall())

@app.route('/api/tasks/completed', methods=['GET'])
def get_completed_tasks():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, text, category, description, created_at, target_month FROM tasks WHERE done = TRUE AND deleted_at IS NULL ORDER BY created_at DESC")
            return jsonify(cur.fetchall())

@app.route('/api/tasks', methods=['POST'])
def add_task():
    data = request.get_json(silent=True) or {}
    text = str(data.get('text', '')).strip()
    if not text or len(text) > 500:
        return jsonify({"error": "A priority must contain 1–500 characters."}), 400
    target_month = data.get('target_month')
    if target_month is not None:
        try:
            target_month = datetime.strptime(str(target_month), '%Y-%m').date().replace(day=1)
        except ValueError:
            return jsonify({"error": "Choose a valid objective month."}), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            if target_month is None:
                cur.execute("INSERT INTO tasks (text, category, description) VALUES (%s, %s, %s)",
                            (text, str(data.get('category', 'General'))[:50], str(data.get('description', ''))[:2000]))
            else:
                cur.execute("INSERT INTO tasks (text, category, description, target_month) VALUES (%s, %s, %s, %s)",
                            (text, str(data.get('category', 'General'))[:50], str(data.get('description', ''))[:2000], target_month))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/tasks/update', methods=['POST'])
def update_task():
    data = request.get_json(silent=True) or {}
    text = str(data.get('text', '')).strip()
    if not text or len(text) > 500 or not isinstance(data.get('id'), int):
        return jsonify({"error": "A valid priority id and 1–500 character title are required."}), 400
    target_month = data.get('target_month')
    if target_month is not None:
        try:
            target_month = datetime.strptime(str(target_month), '%Y-%m').date().replace(day=1)
        except ValueError:
            return jsonify({"error": "Choose a valid objective month."}), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE tasks SET text = %s, category = %s, description = %s, target_month = COALESCE(%s, target_month) WHERE id = %s AND deleted_at IS NULL",
                        (text, str(data.get('category', 'General'))[:50], str(data.get('description', ''))[:2000], target_month, data['id']))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/tasks/toggle', methods=['POST'])
def toggle_task():
    data = request.get_json(silent=True) or {}
    task_id = data.get('id')
    if not isinstance(task_id, int):
        return jsonify({"error": "A valid priority id is required."}), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE tasks SET done = NOT done WHERE id = %s AND deleted_at IS NULL RETURNING done", (task_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Priority not found."}), 404
            new_state = row['done']
        conn.commit()
    return jsonify({"success": True, "done": new_state})

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s AND deleted_at IS NULL", (task_id,))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/undo/<string:kind>/<int:record_id>', methods=['POST'])
def restore_deleted(kind, record_id):
    tables = {"task": "tasks", "transaction": "transactions", "activity": "activities", "conversation": "conversations", "file": "files"}
    table = tables.get(kind)
    if not table:
        return jsonify({"error": "This item cannot be restored."}), 404
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE {table} SET deleted_at = NULL WHERE id = %s AND deleted_at IS NOT NULL", (record_id,))
            if cur.rowcount == 0:
                return jsonify({"error": "This item is no longer available to restore."}), 404
        conn.commit()
    return jsonify({"success": True, "kind": kind, "id": record_id})

# --- FINANCE ---
@app.route('/api/finance/balance', methods=['GET', 'POST'])
def handle_balance():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        try:
            amount = float(data.get('amount', 0))
        except (TypeError, ValueError):
            return jsonify({"error": "Budget must be a number."}), 400
        if not math.isfinite(amount) or amount < 0 or amount > 1_000_000_000:
            return jsonify({"error": "Budget must be between 0 and 1,000,000,000 TND."}), 400
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO settings (key, value) VALUES ('monthly_balance', %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (str(amount),))
            conn.commit()
        return jsonify({"success": True})
    else:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM settings WHERE key = 'monthly_balance'")
                row = cur.fetchone()
                return jsonify({"balance": float(row['value']) if row else 0.0})

@app.route('/api/finance', methods=['GET'])
def get_finance():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM settings WHERE key = 'monthly_balance'")
            balance_row = cur.fetchone()
            monthly_balance = float(balance_row['value']) if balance_row else 0.0
            cur.execute("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND deleted_at IS NULL AND created_at >= CURRENT_DATE - INTERVAL '30 days'")
            expenses = cur.fetchone()['total'] or 0.0
            return jsonify({"monthly_balance": monthly_balance, "expenses": float(expenses), "remaining": float(monthly_balance - expenses)})

@app.route('/api/finance/breakdown', methods=['GET'])
def get_finance_breakdown():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT category, SUM(amount) as value FROM transactions WHERE type = 'expense' AND deleted_at IS NULL AND created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY category")
            return jsonify(cur.fetchall())

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 20")
            return jsonify(cur.fetchall())

@app.route('/api/finance/add', methods=['POST'])
def add_transaction():
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get('amount'))
    except (TypeError, ValueError):
        return jsonify({"error": "Expense amount must be a number."}), 400
    if not math.isfinite(amount) or amount <= 0 or amount > 1_000_000:
        return jsonify({"error": "Expense amount must be greater than 0 and at most 1,000,000 TND."}), 400
    transaction_type = str(data.get('type', 'expense'))
    if transaction_type not in {'expense', 'income'}:
        return jsonify({"error": "Type must be expense or income."}), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO transactions (amount, type, category, description) VALUES (%s, %s, %s, %s)",
                        (amount, transaction_type, str(data.get('category', 'General'))[:50], str(data.get('description', ''))[:1000]))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
def delete_transaction(tx_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s AND deleted_at IS NULL", (tx_id,))
        conn.commit()
    return jsonify({"success": True})

# --- ACTIVITIES ---
@app.route('/api/activities', methods=['GET'])
def get_all_activities():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM activities WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10")
            return jsonify(cur.fetchall())

@app.route('/api/activities/add', methods=['POST'])
def add_activity():
    data = request.get_json(silent=True) or {}
    activity_type = str(data.get('type', ''))
    if activity_type not in {'Gym', 'Run', 'Study', 'Screen Time'}:
        return jsonify({"error": "Activity type must be Gym, Run, Study, or Screen Time."}), 400
    try:
        distance = float(data.get('distance', 0))
        duration = int(data.get('duration_minutes', 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Duration and distance must be numbers."}), 400
    if not math.isfinite(distance) or distance < 0 or duration < 0 or duration > 1440:
        return jsonify({"error": "Distance and duration must be non-negative; duration cannot exceed 24 hours."}), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO activities (type, distance, duration_minutes, description) VALUES (%s, %s, %s, %s)",
                        (activity_type, distance, duration, str(data.get('description', ''))[:1000]))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/activities/<int:act_id>', methods=['DELETE'])
def delete_activity(act_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE activities SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s AND deleted_at IS NULL", (act_id,))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/sleep', methods=['GET', 'POST'])
def log_sleep():
    if request.method == 'GET':
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT hours, quality, date FROM sleep_logs ORDER BY date DESC LIMIT 1")
                return jsonify(cur.fetchone())
    data = request.get_json(silent=True) or {}
    try:
        hours = float(data.get('hours'))
        quality = int(data.get('quality'))
    except (TypeError, ValueError):
        return jsonify({"error": "Sleep hours and quality are required."}), 400
    if not 0 < hours <= 24 or not 1 <= quality <= 10:
        return jsonify({"error": "Sleep must be 0–24 hours and quality must be 1–10."}), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO sleep_logs (date, hours, quality) VALUES (CURRENT_DATE, %s, %s) ON CONFLICT (date) DO UPDATE SET hours = EXCLUDED.hours, quality = EXCLUDED.quality", (hours, quality))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    period = request.args.get('period', 'week')
    if period not in {'week', 'month'}:
        return jsonify({"error": "Period must be week or month."}), 400
    days_back = 7 if period == 'week' else 30
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT CURRENT_DATE AS today")
            today = cur.fetchone()['today']
            current_start = today - timedelta(days=days_back - 1)
            previous_start = current_start - timedelta(days=days_back)
            cur.execute("""
                SELECT created_at::date AS day, type,
                       ROUND(COALESCE(SUM(duration_minutes), 0) / 60.0, 1) AS hours
                FROM activities
                WHERE deleted_at IS NULL AND created_at::date >= %s AND created_at::date <= %s
                GROUP BY created_at::date, type
            """, (previous_start, today))
            rows = cur.fetchall()
    metric_types = ('Gym', 'Study', 'Run')
    invested_types = ('Gym', 'Study', 'Run')
    chart_data = {
        (current_start + timedelta(days=index)).strftime('%b %d'):
            {"date": (current_start + timedelta(days=index)).strftime('%b %d'), "Gym": 0.0, "Study": 0.0, "Run": 0.0}
        for index in range(days_back)
    }
    previous_total = 0.0
    totals_by_type = {activity_type: 0.0 for activity_type in metric_types}
    for row in rows:
        activity_type = row['type']
        if activity_type not in metric_types:
            continue
        hours = float(row['hours'] or 0)
        if row['day'] < current_start:
            previous_total += hours
        else:
            key = row['day'].strftime('%b %d')
            if key in chart_data:
                chart_data[key][activity_type] += hours
                totals_by_type[activity_type] += hours
    for activity_type in totals_by_type:
        totals_by_type[activity_type] = round(totals_by_type[activity_type], 1)
    total = round(sum(totals_by_type[activity_type] for activity_type in invested_types), 1)
    previous_total = round(previous_total, 1)
    return jsonify({
        "series": list(chart_data.values()),
        "summary": {
            "total_hours": total,
            "previous_total_hours": previous_total,
            "change_hours": round(total - previous_total, 1),
            "change_percent": round((total - previous_total) / previous_total * 100, 1) if previous_total > 0 else None,
            "hours_by_activity": totals_by_type,
        },
    })

# --- CHAT ---
@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM conversations WHERE deleted_at IS NULL ORDER BY created_at DESC")
            return jsonify(cur.fetchall())

@app.route('/api/conversations/<int:conv_id>', methods=['GET'])
def get_conversation_messages(conv_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT role, content FROM chat_history WHERE conversation_id = %s AND EXISTS (SELECT 1 FROM conversations WHERE id = %s AND deleted_at IS NULL) ORDER BY id ASC", (conv_id, conv_id))
            return jsonify(cur.fetchall())

@app.route('/api/conversations/<int:conv_id>', methods=['DELETE'])
def delete_conversation(conv_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE conversations SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s AND deleted_at IS NULL", (conv_id,))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/chat', methods=['POST'])
def chat():
    user_message = request.form.get('message', '')
    mode = request.form.get('mode', 'quick')
    conversation_id = request.form.get('conversation_id')
    if len(user_message) > MAX_CHAT_MESSAGE_CHARS or mode not in {'quick', 'study', 'projects', 'therapist'}:
        return jsonify({"error": "Message is too long or the selected mode is invalid."}), 400
    attachment_text = ""
    attachment_notice = ""

    if 'files' in request.files:
        files = request.files.getlist('files')
        if len(files) > 5:
            return jsonify({"error": "Attach up to five files per message."}), 400
        attachments = []
        total_extracted_chars = 0
        for file in files:
            if file.filename == '': continue
            filename = secure_filename(file.filename)
            try:
                file_text, was_truncated = extract_document_text(file, filename)
                attachments.append((filename, file_text))
                total_extracted_chars += len(file_text)
                if was_truncated:
                    attachment_notice = "One or more documents exceeded safe processing limits; only bounded content was retained."
                with get_db() as conn:
                    with conn.cursor() as cur:
                        cur.execute("INSERT INTO files (filename, content) VALUES (%s, %s)", (filename, file_text))
                    conn.commit()
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
            except Exception:
                return jsonify({"error": f"Could not read {filename}. Check that the file is valid."}), 400

        per_file_budget = max(500, MAX_CHAT_ATTACHMENT_CHARS // max(1, len(attachments)))
        selected_total = 0
        for filename, file_text in attachments:
            remaining = MAX_CHAT_ATTACHMENT_CHARS - selected_total
            if remaining <= 0:
                break
            excerpt = select_document_excerpt(file_text, user_message, min(per_file_budget, remaining))
            attachment_text += f"\n--- File: {filename} ---\n{excerpt}\n"
            selected_total += len(excerpt)
        if total_extracted_chars > selected_total:
            budget_notice = (
                f"For lower AI usage, this reply used about {selected_total:,} of {total_extracted_chars:,} extracted attachment characters. "
                "Large documents were sampled for relevant sections. Ask about a specific topic for a more focused pass."
            )
            attachment_notice = " ".join(note for note in (attachment_notice, budget_notice) if note)

    with get_db() as conn:
        with conn.cursor() as cur:
            if not conversation_id or conversation_id == "null":
                title = user_message[:30] + "..." if len(user_message) > 30 else (user_message or "New Chat")
                cur.execute("INSERT INTO conversations (title) VALUES (%s) RETURNING id", (title,))
                conversation_id = cur.fetchone()['id']
            else:
                try:
                    conversation_id = int(conversation_id)
                except ValueError:
                    return jsonify({"error": "Conversation id is invalid."}), 400
                cur.execute("SELECT id FROM conversations WHERE id = %s AND deleted_at IS NULL", (conversation_id,))
                if not cur.fetchone():
                    return jsonify({"error": "Conversation not found."}), 404
            cur.execute("INSERT INTO chat_history (conversation_id, role, content) VALUES (%s, 'user', %s)", (conversation_id, user_message))
        conn.commit()

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT role, content FROM chat_history WHERE conversation_id = %s ORDER BY id DESC LIMIT 10", (conversation_id,))
            history = [{"role": r['role'], "content": r['content']} for r in reversed(cur.fetchall())]
            context = ""
            if mode == 'therapist':
                cur.execute("SELECT hours FROM sleep_logs ORDER BY date DESC LIMIT 1")
                sleep = cur.fetchone()
                cur.execute("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND deleted_at IS NULL AND created_at >= CURRENT_DATE - INTERVAL '7 days'")
                spend = cur.fetchone()['total'] or 0.0

                cur.execute("SELECT text, description, created_at FROM tasks WHERE done = TRUE AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3")
                recent_tasks = cur.fetchall()
                task_context = ""
                for t in recent_tasks:
                    if t['description']: task_context += f"- Finished '{t['text']}' at {t['created_at'].strftime('%H:%M')}. Context: {t['description']}\n"

                context += f"\n--- Sleep: {sleep['hours'] if sleep else 'Unknown'} hrs. Spent this week: {spend} TND. ---\n"
                if task_context: context += f"\n--- Recent Task Completions & Context ---\n{task_context}"
                cur.execute("""
                    SELECT created_at::date AS day, SUM(duration_minutes) AS minutes
                    FROM activities
                    WHERE type = 'Screen Time' AND deleted_at IS NULL
                      AND created_at >= CURRENT_DATE - INTERVAL '6 days'
                    GROUP BY created_at::date
                    ORDER BY day DESC
                    LIMIT 7
                """)
                screen_time_rows = cur.fetchall()
                if screen_time_rows:
                    screen_time_total = sum(int(row['minutes'] or 0) for row in screen_time_rows)
                    screen_time_days = "; ".join(
                        f"{row['day'].isoformat()}: {int(row['minutes'] or 0)} min"
                        for row in screen_time_rows
                    )
                    context += (
                        f"\n--- Manually logged iPhone Screen Time (past 7 days): "
                        f"{screen_time_total} minutes across {len(screen_time_rows)} logged days; "
                        f"daily entries: {screen_time_days}. Treat this as user-entered self-report, "
                        "not automatically imported or clinically verified. ---\n"
                    )

    system_prompt = (
        "You are LiveYours, a warm, candid productivity roommate and practical coach. "
        "Help the user make meaningful progress on the goals they choose, especially "
        "computer-science learning, cybersecurity practice, and hands-on projects when relevant. "
        "Be direct, energetic, and specific: identify the next concrete action, define a small "
        "focus block, and ask for a result or check-in. Challenge avoidance and vague plans "
        "without insulting, shaming, threatening, or pretending to monitor the user. "
        "Respect rest, health, and the user's autonomy; do not diagnose or replace professional care. "
        "For cybersecurity work, keep guidance legal, authorized, and lab-bounded. "
        "Treat user records and attachments as sensitive; use only relevant context and do not "
        "repeat personal details unnecessarily."
    )
    if mode == 'therapist':
        system_prompt += "\nMODE: REFLECTION. Use only the bounded study, activity, screen-time, sleep, and budget context already supplied. Describe patterns without diagnosing; offer one empathetic, practical next step."
    else:
        system_prompt += f"\nMODE: {mode.upper()}. Be a no-BS accountability partner."
    if context: system_prompt += f"\nContext:\n{context}"

    if attachment_text: user_message += f"\n\n[ATTACHMENTS]\n{attachment_text}"
    # Keep recent conversational context, but never resend an unbounded thread to a model.
    recent_history = []
    history_budget = MAX_CHAT_HISTORY_CHARS
    for item in reversed(history[:-1]):
        if history_budget <= 0:
            break
        content = item['content'][-history_budget:]
        recent_history.append({"role": item['role'], "content": content})
        history_budget -= len(content)
    recent_history.reverse()
    recent_history.append({"role": "user", "content": user_message})

    output_budget = {"quick": 900, "study": 1_400, "projects": 1_600, "therapist": 1_000}[mode]
    payload = {
        "model": mode if mode != 'therapist' else 'quick',
        "max_tokens": output_budget,
        "messages": [{"role": "system", "content": system_prompt}] + recent_history,
    }
    try:
        reply = request_ai(
            payload,
            timeout=30,
            coach_profile_context=LIVEYOURS_COACH_PROFILE,
        )['choices'][0]['message']['content']
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO chat_history (conversation_id, role, content) VALUES (%s, 'assistant', %s)", (conversation_id, reply))
            conn.commit()
        return jsonify({"reply": reply, "conversation_id": conversation_id, "attachment_notice": attachment_notice})
    except Exception as exc:
        app.logger.warning("Chat AI providers unavailable (%s).", type(exc).__name__)
        return jsonify({
            "reply": ai_unavailable_message(),
            "conversation_id": conversation_id,
        }), 503

# --- FILES & FLASHCARDS & STANDUP ---
@app.route('/api/files', methods=['GET'])
def get_all_files():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, filename FROM files WHERE deleted_at IS NULL ORDER BY id DESC")
            return jsonify(cur.fetchall())

@app.route('/api/files/<int:file_id>', methods=['DELETE'])
def delete_file(file_id):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE files SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s AND deleted_at IS NULL", (file_id,))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/upload', methods=['POST'])
def upload_files():
    if 'files' not in request.files: return jsonify({"error": "No files"}), 400
    files = request.files.getlist('files')
    if len(files) > 5:
        return jsonify({"error": "Upload up to five files at a time."}), 400
    uploaded = []
    notices = []
    for file in files:
        if file.filename == '': continue
        filename = secure_filename(file.filename)
        extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if extension not in {'pdf', 'png', 'jpg', 'jpeg', 'csv', 'xlsx', 'xls'}:
            return jsonify({"error": "Library files must be PDF, PNG, JPG, CSV, or Excel (.xlsx/.xls)."}), 415
        try:
            text_content, was_truncated = extract_document_text(file, filename)
        except ValueError as exc:
            return jsonify({"error": f"{filename}: {exc}"}), 400
        except Exception:
            return jsonify({"error": f"Could not read {filename}. Check that the file is valid."}), 400
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO files (filename, content) VALUES (%s, %s)", (filename, text_content))
            conn.commit()
        uploaded.append(filename)
        if was_truncated:
            notices.append(f"{filename} was shortened to fit safe document-processing limits.")
    return jsonify({"success": True, "files": uploaded, "notices": notices})

@app.route('/api/flashcards', methods=['POST'])
def generate_flashcards():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT filename, content FROM files WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1")
                file = cur.fetchone()
                if not file or not file['content'].strip(): return jsonify({"error": "No text found in latest file."}), 400

        source_text, sampled = sample_document_text(file['content'], MAX_FLASHCARD_SOURCE_CHARS)
        prompt = f"Create 3 active-recall flashcards from this study text. Return ONLY valid JSON array: [{{\"q\": \"Q\", \"a\": \"A\"}}]. No markdown.\n\nText: {source_text}"
        payload = {"model": "quick", "max_tokens": 700, "messages": [{"role": "user", "content": prompt}]}
        reply = request_ai(payload, timeout=30)['choices'][0]['message']['content'].strip()

        match = re.search(r'\[.*\]', reply, re.DOTALL)
        if match:
            cards = json.loads(match.group(0))
            return jsonify({
                "flashcards": cards,
                "source_note": "Cards use representative sections from across the document to keep AI usage predictable." if sampled else "Cards use the full extracted document.",
            })
        return jsonify({"error": "AI failed to return a valid JSON array."}), 500
    except RuntimeError:
        app.logger.info("Flashcard generation has no successful configured AI provider.")
        return jsonify({"error": ai_unavailable_message()}), 503
    except Exception:
        app.logger.exception("Flashcard generation failed")
        return jsonify({"error": "Flashcard generation failed. Check the configured AI providers and retry."}), 500

@app.route('/api/standup', methods=['GET'])
def get_standup():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT hours FROM sleep_logs ORDER BY date DESC LIMIT 1")
            sleep = cur.fetchone()
            sleep_text = f"{sleep['hours']} hrs" if sleep else "Unknown"
            cur.execute("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND deleted_at IS NULL AND created_at >= CURRENT_DATE - INTERVAL '7 days'")
            spend = cur.fetchone()['total'] or 0.0

    prompt = f"Standup: Sleep: {sleep_text}. Spent: {spend} TND. Give me a 3-bullet briefing. 1. Top priority. 2. Nudge based on sleep/money. 3. Motivational quote. Under 40 words."
    payload = {"model": "quick", "max_tokens": 250, "messages": [{"role": "user", "content": prompt}]}
    try:
        response = request_ai(payload, timeout=15)
        return jsonify({"standup": response['choices'][0]['message']['content']})
    except Exception as exc:
        app.logger.warning("Daily AI check-in unavailable (%s).", type(exc).__name__)
        return jsonify({"error": ai_unavailable_message()}), 503

TUNISIA_CITY_COORDS = {
    "ariana": (36.8625, 10.1956), "tunis": (36.8065, 10.1815), "bizerte": (37.2744, 9.8739),
    "hammamet": (36.4000, 10.6167), "nabeul": (36.4513, 10.7357), "sousse": (35.8256, 10.6369),
    "monastir": (35.7643, 10.8113), "kairouan": (35.6781, 10.0963), "sfax": (34.7406, 10.7603),
    "tabarka": (36.9544, 8.7580), "tozeur": (33.9197, 8.1335), "djerba": (33.8076, 10.8451),
    "medenine": (33.3549, 10.5055), "gafsa": (34.4250, 8.7842), "mahdia": (35.5047, 11.0622),
}

def haversine_km(origin, destination):
    from math import asin, cos, radians, sin, sqrt
    lat1, lon1 = map(radians, origin)
    lat2, lon2 = map(radians, destination)
    delta_lat, delta_lon = lat2 - lat1, lon2 - lon1
    value = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    return 6371 * 2 * asin(sqrt(value))

@app.route('/api/plan_trip', methods=['POST'])
def plan_trip():
    data = request.get_json(silent=True) or {}
    destination = str(data.get('destination', '')).strip()
    if not destination or len(destination) > 80:
        return jsonify({"error": "Enter a Tunisian city name (up to 80 characters)."}), 400
    target_key = destination.casefold()
    origin_name = os.environ.get("HOME_CITY", "").strip()
    origin_coords = TUNISIA_CITY_COORDS.get(origin_name.casefold())
    target_coords = TUNISIA_CITY_COORDS.get(target_key)
    if not origin_coords or not target_coords:
        names = ", ".join(name.title() for name in TUNISIA_CITY_COORDS)
        return jsonify({"error": f"Choose one of these supported cities: {names}. Set HOME_CITY to change your starting point."}), 400
    try:
        budget = float(data.get('budget', 100))
        fuel_price = float(os.environ.get("FUEL_PRICE_TND_PER_LITER", "2.5"))
    except (TypeError, ValueError):
        return jsonify({"error": "Budget and configured fuel price must be numbers."}), 400
    if not math.isfinite(budget) or not math.isfinite(fuel_price) or not 1 <= budget <= 10_000 or not 0 < fuel_price <= 20:
        return jsonify({"error": "Budget must be 1–10,000 TND and fuel price must be 0–20 TND/L."}), 400

    # Great-circle distance is expanded to a road-distance estimate; fuel math stays deterministic.
    one_way_km = haversine_km(origin_coords, target_coords) * 1.25
    round_trip_km = round(one_way_km * 2, 1)
    liters = round(round_trip_km * 9 / 100, 1)
    fuel_cost = round(liters * fuel_price, 1)
    remaining = round(max(0, budget - fuel_cost), 1)
    prompt = (
        f"Plan a realistic low-cost day trip from {origin_name}, Tunisia to {destination.title()}. "
        f"The user's total budget is {budget:.0f} TND. Reserve {fuel_cost:.1f} TND for estimated round-trip fuel "
        f"({round_trip_km:.1f} km, estimated vehicle consumption 9 L/100 km, fuel at {fuel_price:.2f} TND/L). "
        f"Plan food and activities within the remaining {remaining:.1f} TND. Give a concise morning/afternoon plan, "
        "itemized approximate costs, and clearly call prices estimates. Do not claim live opening hours or availability."
    )
    try:
        result = request_ai({"model": "quick", "max_tokens": 350, "messages": [{"role": "user", "content": prompt}]}, timeout=20)
        itinerary = result['choices'][0]['message']['content']
    except Exception as exc:
        app.logger.warning("Trip planner AI unavailable (%s).", type(exc).__name__)
        itinerary = (
            f"Morning — Leave {origin_name} early and head to {destination.title()}. "
            f"Keep about {fuel_cost:.1f} TND aside for round-trip fuel; that leaves {remaining:.1f} TND "
            "for food and activities.\n\n"
            f"Afternoon — Choose one low-cost local attraction, then have a simple meal within the remaining "
            f"{remaining:.1f} TND. Check current prices and opening hours before leaving.\n\n"
            "This is a quick budget-first outline; AI suggestions are temporarily unavailable."
        )
        return jsonify({
            "trip_plan": itinerary,
            "distance_km": round_trip_km,
            "fuel_liters": liters,
            "fuel_cost_tnd": fuel_cost,
            "ai_generated": False,
            "notice": "AI suggestions are temporarily unavailable; showing a quick itinerary.",
        })
    return jsonify({
        "trip_plan": itinerary,
        "distance_km": round_trip_km,
        "fuel_liters": liters,
        "fuel_cost_tnd": fuel_cost,
        "ai_generated": True,
    })

if __name__ == '__main__':
    run_migrations()
    app.run(host='127.0.0.1', port=5000, debug=False)
