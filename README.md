# LiveYours

**A personal operating system for the parts of life that compete for your attention.**

LiveYours brings study, tasks, health routines, spending, and reflection into one private dashboard. It is being built around a practical question: can a young adult turn daily activity into clearer priorities and steadier habits without juggling five separate apps?

> **Project stage:** personal prototype. The current deployment is single-user and is not designed for public multi-tenant use.

## What it does

- Capture and organize study and personal priorities, with completion history and undo.
- Record study, gym, running, sleep, and expenses from a phone.
- Review weekly and monthly activity trends.
- Keep study documents in a library, attach them to contextual chat, and generate active-recall cards from the latest upload.
- Continue AI chats in named threads and switch between quick, study, project, and reflection modes.
- Build budget-first day-trip outlines, with deterministic distance and fuel estimates when AI is unavailable.

## Product principles

- **Capture quickly:** mobile controls are sized for touch, and the bottom navigation respects iPhone safe areas.
- **Show the math:** budgets, fuel calculations, and activity summaries come from application data; AI does not invent those totals.
- **Stay useful when AI is down:** entries are saved through the web service independently of OmniRoute. Hosted AI uses configured providers, and trip planning has a calculated fallback.
- **Bound AI usage:** chat history, attachment context, and generated response lengths have explicit ceilings. Uploads are capped at 20 MB per request, five files, 50 pages per PDF, 13 megapixels per image, and 30,000 extracted characters per file. Chat sends at most 12,000 extracted attachment characters plus a bounded recent history; flashcards sample up to 16,000 characters across a long document. The interface tells the user when content was sampled or capped.
- **Be clear about privacy:** the hosted version stores app data in PostgreSQL and can send chat context to configured cloud AI providers when cloud fallback is enabled. Do not treat it as local-only or as a medical or financial adviser.

## Architecture

```text
iPhone / desktop browser
          │ HTTPS + app authentication
          ▼
React + Vite static bundle ── same-origin JSON API ── Flask application
                                                    ├── liveyours/ai/providers.py
                                                    ├── liveyours/documents.py
                                                    ├── migrations/*.sql
                                                    └── PostgreSQL (Supabase)
                                                         │
                                local: OmniRoute ────────┤
                                hosted: Gemini → OpenRouter → Bytez → LLM7
```

The Render service serves both the API and compiled frontend. Its custom domain reaches Render directly, so sign-in, logging, and database-backed records do not depend on the development PC or OmniRoute. Render is configured for manual deploys. The current Render Free instance can sleep while idle and take time to wake; it is reachable without the PC, but it is not guaranteed to stay warm.

Flask route handlers remain in `app.py` for compatibility. AI provider selection and bounded failover live in `liveyours/ai/providers.py`; document parsing and extraction limits live in `liveyours/documents.py`. SQL migrations are ordered and checksum-verified at startup. This is an incremental separation of high-risk service boundaries, not a claim that the application is already split into independent services.

Browser authentication uses a signed, HTTP-only, SameSite=Lax session cookie; production cookies are Secure. `/healthz` and the sign-in/session bootstrap endpoints are public, while private API routes require an authenticated session. The app remains single-user with one shared login and a privileged server-side database connection.

## Stack

- React, TypeScript, Vite, Tailwind CSS, Recharts, and Lucide
- Python, Flask, Gunicorn, PostgreSQL, and ordered SQL migrations
- pypdf, Tesseract OCR, and Pillow for document extraction
- Render for the web service and Supabase PostgreSQL for persistent data

## Local development

1. Copy `.env.example` to `.env` and fill in local values. Never commit `.env` or real user data.
2. Install Python packages with `python -m pip install -r requirements.txt`.
3. Install frontend packages with `cd frontend && npm ci`.
4. Build the UI with `npm run build`, then return to the repository root and start Flask with `python app.py`.
5. Ensure PostgreSQL is available and Tesseract is installed if you want OCR locally.

## AI coding agents

The repository includes portable agent guidance in `AGENTS.md`, with short Claude Code and Gemini/Antigravity entry points in `CLAUDE.md` and `GEMINI.md`. Shared Agent Skills are under `.agents/skills/`; Claude Code receives a project-local mirror under `.claude/skills/`. These files provide workflows and reference material only. Each coding host still requires its own installed plugins, MCP servers, sign-in, and credentials.

## iPhone Screen Time

Log a daily Screen Time total manually in the mobile logger. To add a one-tap iPhone Shortcut that opens the preselected form, follow [the iOS Screen Time guide](docs/IOS_SCREEN_TIME.md). Automatic import requires a native iOS app and Apple Screen Time entitlements; the website and Shortcut cannot read that data directly.

The production Docker image installs Tesseract and builds the frontend itself. Set `APP_USERNAME`, `APP_PASSWORD`, `SESSION_SECRET_KEY`, `DATABASE_URL`, and any cloud AI keys in the hosting provider's secret environment settings. Google AI Studio uses `GOOGLE_AI_STUDIO_API_KEY` (Gemini OpenAI-compatible endpoint; model configurable with `GOOGLE_AI_STUDIO_MODEL`). Keep `CLOUD_AI_FALLBACK=true` on Render if hosted AI and flashcard generation should work when the PC is offline. Non-AI logging works independently of all model providers.

## Verification

```powershell
python -m unittest discover -s tests -v
cd frontend
npm ci
npm run build
npm run lint
npm audit --omit=dev --audit-level=high
```

The backend tests use mocked database and AI boundaries; they do not replace a signed-in production smoke test. Before a public demo, verify the authenticated app, logging, document upload, and AI fallback using synthetic data.

## Before inviting other users

The current app uses one shared application login and a privileged server-side database connection. It has no per-user identity, tenancy model, or user-scoped row authorization. Sign-in and HTTP Basic credential attempts are throttled in memory after 10 failures in five minutes; the throttle resets when the service restarts and is scoped to the single Gunicorn worker. A public multi-user launch requires individual authentication, row ownership and authorization, account recovery, distributed request throttling, data export/deletion flows, and a documented retention policy. Treat this deployment as a personal project until those controls exist.
