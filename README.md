# ConvoBrief AI

ConvoBrief AI converts long chats, meeting transcripts, emails, and support conversations into structured summaries with source-message references, decisions, action items, deadlines, risks, and open questions. Choose the private on-server NLP engine or a configured AI provider, then review, save, follow up on, and export your brief.

> **Important:** This project is an AI-assisted summarization tool, not a source of record. Its built-in NLP engine is rule-based and external LLM output can be incomplete or incorrect. Verify important conclusions and citations against the original conversation.

## What it does

- Accepts pasted text and TXT, Markdown, JSON, LOG, VTT, PDF, and DOCX uploads (maximum 10 MB).
- Recognizes common WhatsApp, Telegram, email, meeting, support-chat, and speaker-labelled transcript formats.
- Offers quick, detailed, executive, technical, meeting, and action-focused summary modes, with concise, balanced, and comprehensive lengths.
- Extracts and displays key points, decisions, action items, deadlines, unresolved questions, problems, proposed solutions, risks, entities, topic clusters, sentiment, and timeline events.
- Shows source-message references so users can inspect relevant turns in the original conversation.
- Filters common greetings and near-duplicate messages and reports basic message and reading-time metrics.
- Supports a built-in local heuristic engine and optional OpenAI, Anthropic, Google Gemini, and OpenAI-compatible providers.
- Supports grounded follow-up questions, saved summaries, inline edits, dashboard importance filters, speaker filters in results, dark mode, and TXT, JSON, PDF, and DOCX exports.
- Includes private accounts, a shared demo workspace, per-user provider settings, transcript-retention controls, data purge, and an automated diagnostics view.

### How the analysis engine works

The local engine works without an external AI key. It uses deterministic parsing and heuristics for language hints, duplicate detection, importance, action items, deadlines, entities, and other structured fields; it is not a trained language model. In Analyze Conversation, choose **Local NLP (no AI)** to keep processing on this server, or **AI-powered analysis** to send the transcript to your configured provider for selected summary fields and action items while the local engine supplies the broader structured result. AI-powered analysis requires a configured provider and reports provider errors instead of silently returning a local result.

Message citations are references to parsed message numbers, not proof that an extracted statement is correct. Always confirm important information in the source.

## Tech stack

- Next.js App Router, React, and TypeScript
- PostgreSQL with Drizzle ORM, or embedded PGlite for local development
- Tailwind CSS
- Optional external LLM APIs called server-side
- `node:test` validation suite

## Requirements

- Node.js 22.15 or later for the test suite (`module.registerHooks` is used by the test runner)
- npm
- For PostgreSQL mode: a reachable PostgreSQL database

## Run locally

1. Clone the GitHub repository and enter its folder:

   ```sh
   git clone https://github.com/DilanRai/ConvoBrief-AI.git
   cd ConvoBrief-AI
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Create your local environment file:

   **macOS/Linux**

   ```sh
   cp .env.example .env.local
   ```

   **PowerShell**

   ```powershell
   Copy-Item .env.example .env.local
   ```

4. Choose a database:

   - **Embedded local database:** leave `DATABASE_URL` empty in `.env`. In development, the app uses PGlite and applies the checked-in migrations automatically. Its data is stored under `.data/convobrief`.
   - **PostgreSQL:** set `DATABASE_URL` to your PostgreSQL connection string. Before starting the app for the first time, apply the schema:

     ```sh
     npx drizzle-kit push
     ```

   `USE_LOCAL_DB=true` forces PGlite, even if `DATABASE_URL` is set. Use the embedded database for local development, not as a multi-instance production database.

5. Set `APP_ENCRYPTION_SECRET` to a new, random value before storing user-specific provider keys. Generate one with:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Keep this secret stable and private. Changing it makes provider keys encrypted with the previous value unreadable. Do not commit `.env` or production secrets.

6. Start the development server:

   ```sh
   npm run dev
   ```

   Open [http://localhost:5000](http://localhost:5000).

## Configure an LLM provider

External providers are optional. Without a provider key, the app uses its local engine. You can provide server environment variables or configure a per-user key in Settings.

| Provider | Environment variables |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| Groq | `GROQ_API_KEY` |
| NVIDIA NIM | `NVIDIA_API_KEY` and `NVIDIA_MODEL` |
| Environment-selected provider | `LLM_PROVIDER` (used when the account provider is set to Auto) |
| OpenAI-compatible endpoint | `LLM_BASE_URL` and `LLM_API_KEY` |

For OpenAI-compatible services, use the API base URL expected by the service (for example, an endpoint ending in `/v1`, not `/chat/completions`). Some provider/model combinations may not support all request options used by the application.
Groq and NVIDIA NIM can be selected independently in Settings or in the Analyzer Studio. Their default model IDs are `qwen/qwen3.8-27b` and `google/gemma-3-4b-it`; change the model in Settings to use another ID available to your account. NVIDIA requests use `https://integrate.api.nvidia.com/v1`. If NVIDIA lists a model but inference returns 404, verify that your account can invoke that model through NIM.

For an environment-only NVIDIA setup, configure `LLM_PROVIDER=nvidia`, `NVIDIA_API_KEY`, and `NVIDIA_MODEL` in `.env.local`. When the saved provider is Auto, this environment setting selects NVIDIA and uses that key/model pair ahead of the generic saved model. Replace both NVIDIA values together when switching to a model with a different key. Keep `.env.local` private and never commit real API keys.

The checked-in `.env.example` contains placeholders only. Copy it to `.env.local`, then enter your own key and model values there.

**Privacy:** selecting an external provider sends conversation content to that provider for processing. Use the local provider when content must not leave your server. The local provider does not mean data is never stored: by default, analyses and their transcripts are persisted in the configured database.

## Privacy and deployment notes

- Zero-retention applies to **new analyses** created while the setting is enabled: raw transcript text and parsed messages are not retained in the database. The structured summary and analysis metadata are still stored. Existing analyses are not retroactively cleared by switching the setting on.
- “Purge data” deletes a user’s stored conversations, summaries, follow-ups, and activity logs. It does not delete the account.
- Per-user API keys are encrypted at rest using `APP_ENCRYPTION_SECRET`. Configure this explicitly for every deployment and keep it consistent across application instances.
- Use HTTPS in production and protect database credentials and LLM keys using your hosting platform’s secret manager.
- The demo workspace is shared. Do not enter private or sensitive conversations into it.
- Before exposing this app publicly, add operational controls appropriate to your deployment, including authentication hardening, request rate limits, monitoring, backups, and a review of the public diagnostics endpoint.
- The diagnostics endpoint is `GET /api/diagnostics` and is not authentication-protected in this version. Restrict or remove it if that is unsuitable for your deployment.

## API routes

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/auth` | `GET`, `POST` | Check authentication; register, log in, log out, or enter the demo workspace |
| `/api/analyze` | `POST` | Analyze a conversation |
| `/api/upload` | `POST` | Extract text and return transcript preview metrics |
| `/api/analyses` | `GET` | List analyses and dashboard metrics |
| `/api/analyses/[id]` | `GET`, `PATCH`, `DELETE` | Read, update, regenerate, save, export-log, or delete an analysis |
| `/api/analyses/[id]/followup` | `POST` | Ask a follow-up question |
| `/api/settings` | `PATCH`, `DELETE` | Update profile/provider/privacy settings; purge data or delete an account |
| `/api/health` | `GET` | Check database availability |
| `/api/diagnostics` | `GET` | Run the built-in validation scenarios |

## Data model

Drizzle defines these PostgreSQL tables:

- `users`: account profile, password hash, provider preferences, encrypted provider keys, and privacy settings.
- `sessions`: hashed session tokens and expiration times.
- `conversations`: source metadata, transcript or zero-retention placeholder, parsed messages, and analysis metrics.
- `summaries`: mode, provider, structured analysis result, processing stats, and saved/edited state.
- `follow_up_messages`: persisted follow-up questions, answers, and citations.
- `activity_logs`: user-scoped analysis, edit, export, and deletion events.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server on port 5000 |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm test` | Run the 12-scenario validation suite |
| `npm run build` | Create the optimized production build |
| `npm run start` | Start the production server |

For PostgreSQL schema changes, set `DATABASE_URL` in the environment and run `npx drizzle-kit push`. The Drizzle Kit configuration reads this environment variable; it does not target a hard-coded local database.

## Validation scenarios

The test suite checks short and long conversations, duplicate/noise detection, participant attribution, superseding decisions, missing deadlines and assignees, technical extraction, multilingual input, empty-input rejection, invalid uploads, and prompt-injection handling.

Run the app’s interactive diagnostics from Settings, or use:

```sh
npm test
```

## Project layout

```text
src/
  app/
    api/                 Next.js route handlers
    globals.css          Global styles and theme
    layout.tsx           Root layout and metadata
    page.tsx             Workspace entry point
  components/            Workspace, analysis, result, profile, and settings UI
  db/
    index.ts             PGlite/PostgreSQL connection and local migrations
    schema.ts            Drizzle database schema
  lib/
    auth.ts              Session and demo workspace helpers
    dto.ts               Database-to-API mapping
    exporters.ts         TXT, JSON, PDF, and DOCX exports
    file-processor.ts    Upload validation and document text extraction
    llm-provider.ts      Provider selection, requests, and fallback behavior
    nlp-engine.ts        Built-in heuristic analysis and local follow-up answers
    parser.ts            Transcript format parsing and message metrics
    security.ts          Password hashing, key encryption, and input handling
    validation-suite.ts  Built-in validation scenarios
  types/                 Shared domain and result types
drizzle/                 SQL migrations and Drizzle metadata
tests/                   Node test runner entry point
```

## Known limitations

- PDF extraction reads embedded text; scanned image-only PDFs need OCR, which is not included.
- Transcript parsing and the local analysis engine are heuristic and can misclassify speakers, language, duplicates, or intent.
- The local engine has no generative understanding; external providers may improve selected fields but can still return inaccurate results.
- Long transcripts are subject to input limits and provider-specific context limits.
- This repository does not include production email verification, account recovery, or rate limiting.

## License

No license file is currently included. Add a `LICENSE` file before publishing if you want to grant others permission to reuse or distribute this project.
