# LiveYours architecture

## Runtime map

```text
Mobile Safari / desktop browser
  ├─ React pages and components (frontend/src)
  └─ same-origin typed API client (frontend/src/lib/api.ts + contracts.ts)
       └─ Flask application (app.py)
            ├─ Authentication and CSRF origin checks
            ├─ AI provider boundary (liveyours/ai/providers.py)
            ├─ Bounded document extraction (liveyours/documents.py)
            ├─ PostgreSQL access (psycopg2)
            └─ ordered, checksummed schema migrations (migrations/ + migrations.py)
```

The Flask app serves the built Vite bundle and API on one origin. Browser calls therefore use relative `/api/...` paths and the signed session cookie; no API key is shipped to the browser. The current separation is deliberately incremental: route handlers and SQL are still largely in `app.py`.

## Request paths

### Login and private API

`GET /api/auth/session` lets the public app shell discover whether the browser has a session. `POST /api/auth/login` checks the configured shared username/password with constant-time comparison and creates a signed, HTTP-only, SameSite=Lax cookie. The cookie is Secure on Render. Credential attempts are throttled after 10 failures within five minutes; the current in-memory limiter is scoped to the single Gunicorn worker and resets on restart. Other `/api/*` routes require that session (or valid HTTP Basic credentials for compatible clients). Mutating API requests also require a same-origin `Origin` header. `/healthz` is intentionally public and contains no user data.

This is a single-user personal deployment. It does not provide per-person identity, row ownership, tenant isolation, or database row-level authorization. Do not invite multiple users or describe it as a multi-tenant product.

### AI routing

- Local requests try OmniRoute first. The request's `model` is one of `quick`, `study`, `projects`, or `therapist`; OmniRoute resolves those combo identifiers. If OmniRoute fails and `FREELLMAPI_API_KEY` is set, LiveYours forwards the request to the local FreeLLMAPI server using its `auto` route.
- Requests on Render never attempt OmniRoute, FreeLLMAPI, or any URL on the developer's PC.
- When cloud fallback is enabled, configured hosted providers are tried in order: OpenRouter, Bytez, then LLM7. Missing keys skip their provider.
- Each request has a bounded overall timeout. Provider logs record provider name, host, latency, HTTP status, and exception class; they must never include prompt text or credentials.
- Normal task, sleep, activity, and expense logging does not invoke AI.

Cloud models are third parties. Chat and the selected context (for example, attachment excerpts or therapist context) may be sent to whichever configured provider responds. Keep cloud fallback disabled unless that transfer is intended.

### Documents

`liveyours/documents.py` extracts bounded text from PDF, PNG/JPEG, CSV, XLSX, and XLS files. Limits cover upload bytes, PDF pages, OCR pixels, workbook expansion, sheets/rows/columns, and extracted characters. Callers select relevant excerpts or sample long documents before building model prompts. Raw uploads are not a replacement for durable object storage; the current library stores extracted content in PostgreSQL.

### Data and migrations

PostgreSQL is the source of truth for application records. SQL files under `migrations/` are applied in lexical order. `migrations.py` takes a transaction-scoped advisory lock, stores each applied version and SHA-256 checksum in a private schema, and refuses to silently accept edits to an already-applied migration.

## Operations

- Render runs the container and serves the compiled React assets; Supabase stores durable records. Render's local filesystem is ephemeral.
- The service is configured for manual deploys. Deploy only after local tests/build, push the verified commit, trigger a deploy, then check `/healthz`, authenticated flows, and cloud AI with safe synthetic prompts.
- A free Render instance can sleep while idle. PC-independent access means the web/API and database remain hosted; it does not mean a free instance is continuously warm.
- `freellmapi/` is a separate local project and Git repository. It can be used as an optional loopback-only inference fallback when configured, but it is not a production dependency of LiveYours and is not part of the Render container.

## Verification commands

```powershell
python -m compileall -q app.py liveyours migrations.py
python -m unittest discover -s tests -v
npm --prefix frontend run build
npm --prefix frontend run lint
```

Provider smoke checks should use a neutral prompt, strict short output, configured credentials from environment variables, and a timeout. They verify reachability only; they do not establish model quality, account quota, privacy terms, or long-term availability.

## Next boundaries to extract

Keep changes small and preserve contracts while moving responsibilities behind tested services: authentication/session policy, task/objective and logging repositories, conversation persistence, analytics aggregation, and trip calculations. Introduce Flask blueprints only alongside endpoint contract tests. Before supporting other people, add individual accounts, ownership and authorization on every query, rate limits, recovery, export/delete and retention flows, and independent authorization review.
