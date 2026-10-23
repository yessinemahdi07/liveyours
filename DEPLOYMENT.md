# LiveYours deployment runbook

## Target architecture

- Render runs the Flask app and serves the built React client from the same origin. The client uses relative `/api/...` requests, so no separate frontend API URL is required.
- Supabase PostgreSQL stores tasks, activities, sleep logs, transactions, conversations, and extracted file content. Render's local filesystem is temporary and must not be used as the source of truth.
- OmniRoute and FreeLLMAPI are local to the PC and used only by local requests. LiveYours tries OmniRoute first and FreeLLMAPI second when `FREELLMAPI_API_KEY` is configured locally. FreeLLMAPI can route across providers enabled in its local dashboard. Render skips both local services even if a tunnel URL is configured; it tries OpenRouter, then Bytez, then LLM7 when those keys are present and cloud fallback is enabled. Chat prompts and therapist context are sent to whichever external provider answers. Daily logging does not depend on any AI provider.
- The Cloudflare Tunnel remains useful for reaching the PC directly. The public app hostname should point to Render when phone access must continue with the PC off.

## Render service

The checked-in `render.yaml` builds the frontend, installs Tesseract, applies ordered database migrations at startup, and binds Gunicorn to Render's assigned `$PORT`.

Set these environment values in the Render service:

| Variable | Required value |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection string; use the transaction pooler URL if required by the project |
| `GOOGLE_AI_STUDIO_API_KEY` | Optional Google AI Studio key for Gemini hosted fallback |
| `GOOGLE_AI_STUDIO_MODEL` | Optional Gemini model; defaults to `models/gemini-3.1-flash-lite` (verified against the connected account's model catalog and synthetic completion) |
| `OPENROUTER_API_KEY` | OpenRouter key for AI when the local PC is unavailable |
| `LIVEYOURS_COACH_PROFILE` | Optional private coaching profile (max 4,000 chars); sent only with OpenRouter requests, never to Bytez/LLM7 fallback |
| `BYTEZ_API_KEY` | Optional Bytez fallback key for AI when the local PC is unavailable |
| `BYTEZ_MODEL` | Optional Bytez chat model ID; defaults to `Qwen/Qwen3-4B` |
| `HOME_CITY` | Optional private trip-planning origin; leave unset to require a selected supported origin |
| `LLM7_API_KEY` | Optional LLM7 fallback key; model defaults to the configured LLM7 `gpt-4o-mini-2024-07-18` endpoint |
| `FREELLMAPI_URL` | Local FreeLLMAPI chat endpoint; defaults to `http://127.0.0.1:3001/v1/chat/completions` |
| `FREELLMAPI_API_KEY` | Optional local FreeLLMAPI unified API key; do not set this on Render |
| `APP_USERNAME` | Login name; defaults to `liveyours` in the Blueprint |
| `APP_PASSWORD` | A unique strong password; Render can generate one |
| `SESSION_SECRET_KEY` | Long random signing secret for browser sessions; required on Render |
| `CLOUD_AI_FALLBACK` | `true` on Render to enable the requested hosted fallback |

Keep `CLOUD_AI_FALLBACK=false` in local `.env` unless direct cloud processing is intentionally wanted there. Set `OMNIROUTE_API_KEY` to an active OmniRoute API key locally; the app does not expose OmniRoute credentials. To use FreeLLMAPI, start its local server, copy its unified API key from the dashboard, and set `FREELLMAPI_API_KEY` in LiveYours' local `.env`. API keys, session secrets, passwords, and database URLs belong only in environment variables, never in Git. Keep `LIVEYOURS_COACH_PROFILE` private and free of credentials or sensitive records. It is included only on OpenRouter requests; fallback providers receive chat context without this additional profile. Configure it only when you consent to OpenRouter processing those profile details.

AI calls use one overall time budget and move to the next configured provider quickly. The hosted fallback order is Google AI Studio, OpenRouter, Bytez, then LLM7. When a private `LIVEYOURS_COACH_PROFILE` is configured, OpenRouter is tried first so only the explicitly selected provider receives it; Google, Bytez, and LLM7 remain profile-free fallbacks. Unconfigured providers are skipped. The trip planner returns a fuel-calculated, budget-first outline if all AI providers are slow or unavailable.

After deployment, check `https://<render-service>.onrender.com/healthz` returns `200`. The app shell serves a sign-in screen; verify unauthenticated `/api/*` requests return `401`, then sign in and test task, sleep, activity, and expense logging while the PC and OmniRoute are off. Use synthetic test entries and remove them through the app's normal recovery flow after verification.

## Move the app hostname to Render

1. In the Render web service settings, add your chosen hostname under Custom Domains. Use the exact `onrender.com` hostname shown for that service; do not infer it from the service label.
2. In Cloudflare DNS, replace the current `app` tunnel record with a CNAME to that Render hostname. Start with **DNS only**. Remove any `AAAA` record for `app` and set Cloudflare SSL/TLS mode to **Full**.
3. Verify the domain in Render and wait for its TLS certificate to become valid. Then test the HTTPS domain with the PC off. Render's instructions allow enabling Cloudflare proxying after certificate issuance; keeping DNS-only is the simpler initial setup.
4. Keep the named tunnel configuration available for local access or rollback. It no longer serves the public app hostname once that DNS record points to Render.
5. Add the HTTPS domain to the iPhone Home Screen after the cloud test succeeds.

The Render custom-domain flow must be completed before changing DNS. The exact service hostname and domain-verification state are account-specific, so they must be read from the Render dashboard. If the Render service uses the Free plan, expect it to sleep after 15 minutes idle and take about a minute to wake; an always-on paid instance is required for consistently immediate access.

## Local development

Install Python requirements and the `frontend` npm lockfile dependencies, install Tesseract OCR, and set `DATABASE_URL` in `.env`. `python app.py` applies migrations before starting the loopback-only development server at `127.0.0.1:5000`. Run `npm --prefix frontend run build` before checking the Flask-served production bundle.
