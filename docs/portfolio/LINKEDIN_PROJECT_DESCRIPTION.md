# LiveYours — LinkedIn project entry

**Description (1417 characters; LinkedIn limit: 2,000)**

LiveYours is a mobile-first personal workspace I designed and built to bring priorities, study, wellbeing routines, budgeting, and reflection into one place. It combines monthly objectives and tasks, quick capture for priorities and expenses, activity and sleep logs, study and spending analytics, a document library with bounded extraction and active-recall flashcards, persistent AI conversations, and budget-first trip planning.

I built the client with React, TypeScript, Vite, and Tailwind CSS, and the API with Python, Flask, and PostgreSQL. The responsive interface includes iPhone 13-sized layouts. Core records and deterministic calculations remain useful independently of AI availability; optional AI features use bounded context and depend on separately configured providers and their finite quotas.

The app is deployed as an authenticated, single-user web service, so its hosted records do not depend on my development PC being on. The current Render Free instance may sleep while idle. Hosted AI availability and a fresh production completion have not been verified in this release, so I do not claim uninterrupted AI or unlimited capacity.

LiveYours is an evolving personal engineering project, not a multi-user SaaS product. Building it has helped me practice product design, secure full-stack engineering, responsive workflows, document processing, and graceful behavior when upstream services fail.

## Suggested project details

- **Name:** LiveYours — Personal Productivity PWA
- **Skills:** React, TypeScript, Flask, PostgreSQL, Progressive Web Apps, API Design, Responsive Web Design, AI Integration
- **Media order:** `01-dashboard.png`, `02-quick-capture.png`, `03-analytics.png`, `04-study-library.png`, `05-trip-planner.png`
- **Privacy:** Screenshots contain synthetic demo records and retain the “Illustrative demo data” label. The owner name has been removed from the public copies.

The app is an authenticated single-user project. Render Free may sleep while idle; hosted AI completion and uninterrupted availability are not claimed.
