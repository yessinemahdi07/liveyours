# Repository context

For owner-specific goals, project history, verified milestones, and private working context, read `ABOUT_ME_SECOND_BRAIN.md` when that local file is available. It is intentionally excluded from Git; never copy its personal details or private data into public project files without an explicit request.

Keep provider configuration facts current in that document when they are reverified. A configured or green provider is not considered working until a synthetic end-to-end completion succeeds.

Use `README.md` for the public project overview and `ARCHITECTURE.md` for implementation boundaries. Inspect the current working tree before editing; preserve unrelated user changes.

## Agent skills and context

- Shared portable skills live in `.agents/skills/`; Claude Code project skills are mirrored in `.claude/skills/`. Antigravity can read the shared `.agents/skills/` collection. Read a matching `SKILL.md` and its referenced resources before specialized work.
- `CLAUDE.md` and `GEMINI.md` are short host-specific pointers to this file. Keep project conventions in `AGENTS.md`; keep owner goals and private milestones in the Git-ignored `ABOUT_ME_SECOND_BRAIN.md`.
- Skills provide instructions and supporting files; they do not install another app's plugins, credentials, MCP servers, or tools. Verify those separately in each host.
- The private FreeLLMAPI Codex CLI setup is user-level (`~/.codex/config.toml`) and must never be copied into this public repository. The local CLI launcher uses the `freellmapi` profile and `FREELLMAPI_API_KEY` from the user's environment.
- After completing a substantial LiveYours milestone or a major objective the owner has chosen, update the local `ABOUT_ME_SECOND_BRAIN.md` in the same session. Record verified work and test/deploy evidence, keep personal details and secrets out of public files, and do not invent objectives or claim unverified outcomes. Claude Code and Antigravity should follow this rule through their project context files.

## Engineering and delivery standard

Act as a senior product engineering partner: clarify the user outcome, choose the smallest coherent change, and explain trade-offs in practical terms. Keep architecture modular at service boundaries, preserve API and data contracts, and favor secure defaults, observability, accessibility, and resilient behavior when providers are unavailable. Do not claim credentials, uptime, model quality, provider quota, or production readiness without evidence.

For substantial work, identify the acceptance criteria and affected boundaries before editing. Keep changes reviewable, document operational configuration, and verify with the repository's documented checks before shipping. Deploy only after the current diff has been reviewed and the required checks pass; report the exact deployment evidence and any provider or account limits. Never put secrets, personal records, or synthetic-check payloads containing private data in source control or logs.

AI usage is finite and provider quotas are independent. Prefer concise context, bounded histories and outputs, and configured failover. Treat catalogs, green status indicators, and aggregated quota estimates as hints until an end-to-end completion succeeds. Never promise unlimited tokens or route private data to an unverified provider.
