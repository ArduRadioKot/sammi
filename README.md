# Sammi

**Sammi is a B2B workspace for organizing CRM data and understanding the people, roles, and relationships behind a customer account.** It combines a PostgreSQL-backed table editor with local AI-assisted account analysis, source research, and relationship mapping.

<p align="center">
  <img src="public/product/table-editor.png" alt="Sammi table editor" width="100%" />
</p>

<p align="center">
  <img src="public/product/one-route/influence-preview.webp" alt="Sammi stakeholder relationship map and contact details" width="100%" />
</p>

> The images above are product captures included in this repository. Their sample records are illustrative; a new workspace has no product data by default.

## What Sammi does

- **Work with CRM data:** create tables, columns, and rows; import and export real CSV files; search, filter, and edit records.
- **Enrich company records:** look up companies by tax identifier through the FastAPI backend and DaData.
- **Analyze customer relationships:** identify decision roles, influence, reporting lines, interaction history, risks, and next steps for an account.
- **Research public sources:** discover and review relevant publications with SearXNG, RSS/Atom feeds, URLs, and uploaded documents.
- **Ask the relationship assistant:** query the analysis corpus, prepare account briefs, find paths between contacts, and draft follow-up emails. Chat threads and turns are stored in PostgreSQL.
- **Explore maps:** view a customer's stakeholder network and geocode address columns on a geographic map.

The relationship-analysis pipeline uses the locally installed **Gemma 4** model through Ollama. Database-backed tables and records are served by FastAPI and PostgreSQL. Demo data is disabled by default (`VITE_ENABLE_DEMO_DATA=false`). Passwordless email/JWT authentication is currently a beta flow. **AI Column and Waterfall are not implemented.**

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router, Zustand |
| API | FastAPI, Pydantic, SQLAlchemy (async), Alembic |
| Database | PostgreSQL 16, asyncpg |
| Local AI | Ollama with Gemma 4 |
| Public web search | SearXNG (optional) |
| Company enrichment | DaData (optional) |
| Address geocoding | OpenStreetMap Nominatim |
| Deployment | Docker Compose for local development; Render Blueprint for hosted services |

## Getting started

### Requirements

- Docker Compose, or Node.js 22.12+, Python 3.12, and PostgreSQL 16.
- Ollama with the configured Gemma 4 model for relationship analysis and the assistant.
- Optional: SearXNG for web discovery and a DaData API key for company enrichment.
- FFmpeg is required for audio transcription. It is included in the API Docker image; for a host-based API, install it and make sure it is on `PATH`.

### Run the full stack with Docker Compose

1. Create the local environment file and set a private database password and application secret:

   ```bash
   cp .env.example .env
   openssl rand -hex 32
   ```

   Put the generated value in `SECRET_KEY` and set `POSTGRES_PASSWORD`. When the API runs in Docker Desktop and Ollama runs on the host, set `OLLAMA_BASE_URL=http://host.docker.internal:11434` in `.env`. On Linux, use a host address reachable from the API container.

2. Start the services and apply database migrations:

   ```bash
   docker compose up -d --build
   docker compose exec api alembic upgrade head
   docker compose ps
   curl -fsS http://localhost:8000/api/v1/health
   ```

3. Open [http://localhost:3000](http://localhost:3000), sign in with an email in the beta flow, then create a table or import a CSV.

| Service | Local URL |
| --- | --- |
| Web app | [http://localhost:3000](http://localhost:3000) |
| FastAPI | [http://localhost:8000](http://localhost:8000) |
| Swagger UI | [http://localhost:8000/docs](http://localhost:8000/docs) |
| OpenAPI schema | [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json) |
| API and database health | [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health) |
| PostgreSQL | `localhost:5432` |
| SearXNG (with the `search` profile) | [http://localhost:8888](http://localhost:8888) |

The API connects to the Compose database at `db`. PostgreSQL initializes the configured user and database on first startup. If a database volume already exists, changing `.env` does not change the credentials stored in that volume.

### Run the API and frontend on the host

Use this option if PostgreSQL and Ollama are already available on your machine. You can start just the Compose database with `docker compose up -d db`.

1. Configure the root `.env` and `apps/api/.env` for local services. The API-specific file is loaded when running from `apps/api` and overrides duplicate values from the root file.

   ```dotenv
   APP_ENV=development
   DATABASE_URL=postgresql+asyncpg://sammi:your-local-password@localhost:5432/sammi
   SECRET_KEY=replace-with-a-local-secret
   CORS_ORIGINS=http://localhost:3000
   FRONTEND_URL=http://localhost:3000
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   ```

   Set `VITE_API_URL=http://localhost:8000` in the root `.env`. Do not add `/api/v1` to this frontend value.

2. In the first terminal, install and start the API:

   ```bash
   cd apps/api
   python3.12 -m venv .venv
   source .venv/bin/activate
   python -m pip install -r requirements.txt
   python -m alembic upgrade head
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

3. In a second terminal, from the repository root, install and start Vite:

   ```bash
   npm ci
   npm run dev
   ```

Restart Vite after changing a `VITE_*` variable.

## Ollama and web search

### Ollama

Make sure Ollama is running and the model configured by the relationship-analysis service is installed. The current analysis and assistant implementation uses Gemma 4 via Ollama.

```bash
ollama list
curl -fsS http://127.0.0.1:11434/api/tags
```

The API's `OLLAMA_BASE_URL` must be reachable from the API process. The provider settings page can check Ollama and run a test generation. Audio transcription additionally requires an Ollama server that supports `/v1/audio/transcriptions`.

### SearXNG (optional)

SearXNG enables web discovery by contact name and company. The project configuration enables JSON responses.

1. Generate a secret and add it to the root `.env` as `SEARXNG_SECRET`:

   ```bash
   openssl rand -hex 32
   ```

2. Set `RELATIONSHIP_SEARCH_BASE_URL` according to where FastAPI runs, then start SearXNG:

   | API location | `RELATIONSHIP_SEARCH_BASE_URL` | Start command |
   | --- | --- | --- |
   | FastAPI in Compose | `http://searxng:8080` | `docker compose --profile search up -d searxng api` |
   | FastAPI on the host | `http://127.0.0.1:8888` | `docker compose --profile search up -d searxng` |
   | External SearXNG | Its reachable base URL with JSON enabled | Start it using your infrastructure |

The value is a base URL; FastAPI adds `/search`. An empty value disables name-based web search. Direct HTTPS URLs, RSS/Atom feeds, and uploaded documents can be used as analysis sources when relationship analysis is enabled.

Check a local SearXNG instance with a public or fictional query:

```bash
curl -fsS 'http://127.0.0.1:8888/search' \
  --data-urlencode 'q=Linux Foundation conference' \
  --data-urlencode 'format=json'
```

## Working with tables and CSV

Tables belong to a workspace and are stored in PostgreSQL. Supported table types are `company`, `person`, and `custom`. Supported column types include `text`, `number`, `boolean`, `date`, `url`, `email`, `phone`, `select`, and `enrichment`.

### Import a CSV

1. Choose **Import CSV** in a workspace, or start an import from an existing table to append rows.
2. Upload the file and review the detected headers, types, encoding, and delimiter.
3. For each CSV field, choose to create a column, map it to an existing column, or skip it.
4. Confirm the import. The backend validates and saves the import transactionally; validation errors include row and column details.
5. Export a table from its editor. The backend streams all rows as UTF-8 CSV and escapes values that could be interpreted as spreadsheet formulas.

CSV import accepts UTF-8 (with or without BOM) and Windows-1251. Default limits are 10 MB, 10,000 rows, and 20 preview rows. Importing the same file again appends duplicate rows; imports do not perform automatic deduplication.

### Relationship-analysis CSV fields

A simple input might look like this:

```csv
full_name,contact_id,company,title,department,decision_role,decision_authority,reports_to_id,occurred_at,channel,summary,project_id
Irina Volkova,c-001,Example Infrastructure,IT Director,IT,Decision maker,yes,,2026-11-20,Meeting,Agreed on a migration pilot,pilot-01
Alexey Sokolov,c-002,Example Infrastructure,Architect,IT,Influencer,no,c-001,2026-11-18,Call,Discussed Kubernetes,pilot-01
```

Import one customer account per table. Repeat the stable `contact_id` and contact name on each interaction row. Use different IDs for people with the same name. `reports_to_id` points to a manager's contact ID. If the input has no company column, the table name is used as the account name.

| Data | Example fields |
| --- | --- |
| Contact | `full_name` (required), `contact_id`, `company`, `title`, `department` |
| Decision roles | `decision_role`, `decision_authority`, `manager_influence`, `loyalty_assessment`, `account_loyalty` |
| Interactions | `interaction` or `summary`, `occurred_at`, `employee_name`, `channel`, `direction`, `interaction_type`, `project_name`, `project_id`, `feedback`, `outcome`, `next_step` |
| Relationships | `reports_to_id`, `target_contact_id`, `relationship_type`, `influence_scope`, `strength`, `valid_from`, `valid_to`, `confidence` |
| Public materials | `public_text`, `source_url`, `event_date`, `event_title`, `event_type`, `organizer`, `person_role` |
| CRM account data | For example, `industry`, `active_projects`, `deal_value_total`, `last_deal_at`, `last_interaction_at`, `technology_stack` |

Common Russian and English headers are recognized automatically, including name, company, title, and meeting date. For custom headers, select the matching columns in the analysis setup. See [the example datasets](examples/relationship/README.md) and [the relationship schema](apps/api/app/schemas/relationship.py).

## Relationship analysis

The analysis is designed for one customer account at a time. It starts from CRM rows and can combine interaction history, manually supplied relationships, public web sources, feeds, links, and uploaded documents. A report is available while background processing continues.

### Typical workflow

1. Import a people table or a CSV with contact names and a company. Review the option to start relationship analysis during import, or start it from the table later.
2. Configure web search, feeds, URLs, and optional files. The backend saves a snapshot of the table and queues an analysis run.
3. Follow the run progress, checked contacts, discovered links, and source review statuses in the report.
4. Resolve ambiguous sources by choosing the matching contact or rejecting the source. A review decision is saved with its reviewer and timestamp.
5. Explore the stakeholder map and contact details. Review evidence, citations, source URLs, and the recommended next step attached to each contact.
6. Browse the five linked result tables, or publish selected summary fields back to the source table.

### Analysis pipeline

1. **Prepare the corpus.** The API snapshots source rows, normalizes identity fields, and extracts text from supported files. Audio can be transcribed locally; audio citations include time ranges.
2. **Find and fetch sources.** SearXNG can search by name and company. The pipeline also supports RSS/Atom, supplied HTTPS URLs, and `source_url` values in the source table. URLs are deduplicated and downloads are bounded.
3. **Match materials to contacts.** Matching uses name, company, title, and publication date where available. Fuzzy matching and Russian text normalization help handle spelling variants. Weak or ambiguous matches are sent for manual review.
4. **Extract evidence and calculate metrics.** Gemma 4 extracts topics, technologies, titles, positions, events, and suggested next steps using structured output. The API checks quoted evidence against the source text and retains partial results when a source fails.
5. **Retrieve and assist.** Search combines BM25, Russian lemmatization, business synonyms, and local latent semantic analysis. The assistant answers questions against the corpus, prepares briefs, finds paths through recorded relationships, and drafts follow-up email text.
6. **Build and publish the account view.** The map uses reported-to and confirmed relationships. Suggested links require editor review. Completion updates the derived tables; scheduled rediscovery can be set to daily, weekly, or off.

Runs and progress are stored in PostgreSQL. Background jobs run in the FastAPI process and can resume after restart. If the API is stopped, queued work waits. Editing source rows makes the snapshot stale and pauses scheduled refresh until a new analysis is run. Partial runs can be retried while the snapshot is current.

### Derived datasets

The report can expose five PostgreSQL-backed tables containing 61 fields from the KROK case presentation:

| Dataset | Grain | Examples |
| --- | --- | --- |
| `companies` | One row per account | Industry, active projects, deal value, relationship coverage, account risks |
| `contacts` | One row per contact | Decision role, influence, manager, interactions, public appearances, next action |
| `interactions` | One row per touchpoint | Date, channel, project, summary, outcome, feedback, next step |
| `public_events` | One row per verified source and person | Event, source URL, topics, technologies, evidence excerpt, confidence |
| `relationships` | One row per contact-to-contact relationship | Source and target IDs, type, project, strength, validity, confidence |

Source-table publication writes 13 analysis fields and updates the existing analysis columns on subsequent publication. If an output name collides with a source column, the output column receives the suffix `· analysis`. The canonical dataset definitions are in [datasets.py](apps/api/app/services/relationship/datasets.py).

### Metrics and evidence

The report includes decision roles, influence, relationship trend and health, last touch, touch count over 90 days, role coverage, account risks, business relevance, and profile confidence. Scores use CRM values and available interaction or source evidence; missing evidence does not contribute to a score. Thresholds can be configured with `RELATIONSHIP_*` environment variables. The report exposes supporting signals and citations so users can review the basis for a conclusion. Treat inferred roles and recommendations as analysis suggestions, not verified CRM facts.

### Input limits

| Input | Current limit |
| --- | --- |
| Contacts and source rows | Up to 40 contacts and 1,000 rows per run |
| Text corpus | Up to 600,000 characters |
| Attachments | Up to 8 files, 5 MB each; up to 30,000 extracted characters per document |
| Documents | Text-based PDF (up to 60 pages), PPTX, HTML, TXT, MD, SRT, VTT |
| Audio | Up to 3 files, 120 seconds each; WAV, MP3, M4A, OGG, FLAC, AAC |
| Sources | Up to 8 URLs and 4 feeds per form; up to 40 fetched publications per pass |
| Background run | Up to 360 seconds; partial results are retained on failure |

Scanned PDFs need a text layer or a supplied transcript. To associate an audio recording with an interaction, provide a contact name or ID.

## Architecture

```mermaid
flowchart LR
    U[User] --> FE[React + Vite + TypeScript]
    FE -->|REST + JWT| API[FastAPI]
    API --> DB[(PostgreSQL)]
    API --> JOB[Relationship analysis worker]
    JOB --> DB
    JOB --> O[Ollama + Gemma 4]
    JOB --> S[SearXNG / RSS / HTTPS sources]
    API --> D[DaData]
    API --> N[Nominatim]
```

- **Frontend:** React and TypeScript app with a table editor, typed API clients, and shared styles. The editor uses TanStack Table and row virtualization; the geographic map uses Leaflet.
- **Backend:** FastAPI routes validate requests and enforce workspace access. Async SQLAlchemy repositories persist application data; Alembic manages schema changes.
- **Analysis jobs:** The FastAPI process stores run state and progress in PostgreSQL and coordinates work with database locks. Redis or an external broker is not required for this workflow.
- **Derived tables:** Analysis datasets use the same table, column, and row storage as editable workspace tables and remain linked to the source table.

Key PostgreSQL entities include `users`, `workspaces`, `workspace_members`, `tables`, `table_columns`, `table_rows`, `relationship_analysis_runs`, `credit_accounts`, `credit_transactions`, `enrichment_runs`, `enrichment_attempts`, `cell_provenance`, and `geocode_cache`. Assistant threads and turns are stored in the assistant-history tables.

## Authentication and integrations

The beta login endpoint accepts an email and returns a JWT. The current beta flow does not verify control of the email inbox; configure a trusted identity-verification layer before exposing it publicly. The frontend stores the access token in `localStorage` and sends it as a Bearer token. Table operations verify workspace membership on the API.

| Integration | Data sent |
| --- | --- |
| Local Ollama | Selected source excerpts, assistant questions, and audio for transcription |
| SearXNG and its search engines | Contact name, company, and professional search keywords |
| Public websites and feeds | Requests to read selected public resources |
| DaData | Tax ID (INN or OGRN) for an enrichment request |
| Nominatim | Address values from the selected table column |
| OpenStreetMap | Map tile requests from the browser |

External source fetching restricts destinations to public HTTPS endpoints and bounds response size. Access to workspace data and reports is checked by the API.

### DaData enrichment

Add an **Enrichment** column, choose DaData and the `company_by_identifier` operation, then select the input identifier and output field. The API calls DaData; the React app does not call DaData directly. Configure `DADATA_API_KEY` on the backend. Enrichment results include value provenance, and runs retain attempt records. The current synchronous run limit is 50 rows by default.

### Credits and AI providers

Credits are workspace ledger entries stored in PostgreSQL. DaData reserves credits for eligible rows, charges successful lookups, and releases unused reservations. Local Ollama generation and relationship analysis do not use DaData credits. Ollama settings include connectivity checks, model listing, and test generation. Yandex AI Studio and GigaChat configuration checks are available, but generation through those adapters is not currently enabled.

## API overview

The default API prefix is `/api/v1`. Interactive documentation is available at `/docs` when the API is running.

| Area | Common routes |
| --- | --- |
| Health and authentication | `GET /health`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Workspaces and tables | `/workspaces`, `/workspaces/{workspace_id}/tables`, `/tables/{table_id}` |
| Columns and rows | `/tables/{table_id}/columns`, `/tables/{table_id}/rows` |
| CSV | `/workspaces/{workspace_id}/imports/csv`, `/tables/{table_id}/imports/csv`, `/tables/{table_id}/export.csv` |
| Map and credits | `/tables/{table_id}/map`, `/workspaces/{workspace_id}/credits` |
| Enrichment | `/enrichment/providers`, `/tables/{table_id}/enrichment/runs` |
| Relationship analysis | `/tables/{table_id}/relationship-analysis` |
| Assistant | `POST /tables/{table_id}/relationship-analysis/ask` |
| AI provider checks | `/system/ai/providers` |

The relationship-analysis API supports setup, create/retry, report retrieval, scheduled refresh, source review, relationship approval, assistant requests, and publishing report fields. See the live OpenAPI schema for the exact request and response models.

Example health check:

```bash
curl -fsS http://localhost:8000/api/v1/health
```

Expected response when PostgreSQL is reachable:

```json
{"status":"ok","database":"ok"}
```

## Configuration

Start from [`.env.example`](.env.example). Vite reads `VITE_*` settings from the repository root. FastAPI reads process environment variables and `.env` files. Compose passes through variables declared in [docker-compose.yml](docker-compose.yml). Keep secrets out of version control.

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | API environment, such as `development` or `test` |
| `DATABASE_URL` | Async PostgreSQL connection for the API |
| `SECRET_KEY` | JWT signing secret |
| `CORS_ORIGINS` | Allowed frontend origins, including scheme and port |
| `FRONTEND_URL` | Frontend base URL used by the API |
| `VITE_API_URL` | API base URL for the Vite frontend, without `/api/v1` |
| `VITE_ENABLE_DEMO_DATA` | Demo data toggle; defaults to `false` |
| `OLLAMA_BASE_URL` | Ollama URL reachable from FastAPI |
| `OLLAMA_MODEL` | Default model for provider test generation |
| `RELATIONSHIP_AI_ENABLED` | Enables or disables relationship analysis and assistant |
| `RELATIONSHIP_SEARCH_BASE_URL` | Optional SearXNG base URL |
| `SEARXNG_SECRET` | Secret for the Compose SearXNG service |
| `RELATIONSHIP_IDENTITY_THRESHOLD` | Source-to-contact match threshold |
| `RELATIONSHIP_DECISION_THRESHOLD` | Decision-maker influence threshold |
| `RELATIONSHIP_INFLUENCE_THRESHOLD` | Influencer threshold |
| `RELATIONSHIP_CONFIRMATION_THRESHOLD` | Threshold for confirmation of inferred roles |
| `DADATA_API_KEY` | Optional DaData API key |
| `CSV_MAX_FILE_SIZE_MB`, `CSV_MAX_ROWS` | CSV import limits |
| `GEOCODING_BASE_URL`, `GEOCODING_USER_AGENT` | Nominatim endpoint and client identification |
| `TEST_DATABASE_URL` | Pytest database URL; must target `sammi_test` |

For the full set of optional settings and defaults, see [`.env.example`](.env.example).

## Development checks

### Backend tests

**Run pytest only against the dedicated `sammi_test` database. Never point tests at `sammi`.** The test suite requires `TEST_DATABASE_URL`; it does not fall back to `DATABASE_URL`.

Create the test database once if needed:

```bash
docker compose exec db psql -U sammi -d postgres \
  -c 'CREATE DATABASE sammi_test OWNER sammi;'
```

Then, from `apps/api` in the activated virtual environment:

```bash
export TEST_DATABASE_URL='postgresql+asyncpg://sammi:your-local-password@localhost:5432/sammi_test'
APP_ENV=test DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head
APP_ENV=test DATABASE_URL="$TEST_DATABASE_URL" python -m pytest -q -rs
```

Optional live-provider checks also require the test database:

```bash
OLLAMA_INTEGRATION_TEST=true python -m pytest -m ollama -q -rs
DADATA_INTEGRATION_TEST=true python -m pytest -m dadata -q -rs
```

The Ollama check requires the configured Gemma 4 model; the DaData check requires `DADATA_API_KEY`.

### Frontend checks

From the repository root:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Deployment and troubleshooting

The [Render Blueprint](render.yaml) describes the static Vite frontend, FastAPI service, and PostgreSQL database. The API service applies Alembic migrations before starting Uvicorn. The frontend receives the API URL at build time, and its deployed origin is used for CORS. Ollama and SearXNG are not provisioned by the Blueprint; provide reachable instances separately if hosted relationship analysis needs them.

For local diagnostics:

```bash
docker compose ps
docker compose logs --tail 100 api
docker compose --profile search logs --tail 100 searxng
docker compose exec api alembic current
curl -fsS http://localhost:8000/api/v1/health
```

| Symptom | Check |
| --- | --- |
| Health check returns 503 | Confirm PostgreSQL is running and that `DATABASE_URL` uses `db` from Compose or `localhost` from a host process. |
| Missing database table or column | Check `alembic current` and run `alembic upgrade head` against the intended database. |
| Browser reports a CORS error | Add the frontend origin, including scheme and port, to `CORS_ORIGINS`. |
| Frontend cannot reach the API | Check `VITE_API_URL`, the API health endpoint, and whether Vite was restarted after configuration changes. |
| Table request returns 404 | Confirm the signed-in user belongs to the workspace that owns the table. |
| CSV import fails | Check encoding, delimiter, header mapping, and the preview's file signature; inspect `error.details` in the API response. |
| Web search is unavailable | Check `RELATIONSHIP_SEARCH_BASE_URL`, JSON support in SearXNG, and network reachability from FastAPI. |
| Ollama or the model is unavailable | Check `/api/tags`, the configured model, and whether the API process can reach `OLLAMA_BASE_URL`. |
| Analysis is stale or waiting | Start the API, review the run status, and rerun analysis after source rows change. |
| Pytest stops before running | Verify that `TEST_DATABASE_URL` points to the existing `sammi_test` database and that migrations are applied there. |

`docker compose down` stops services and keeps the PostgreSQL volume. `docker compose down -v` removes the project's volumes and database data.

## Repository layout

```text
.
├── src/
│   ├── components/              # Shared UI, app shell, and authentication
│   ├── features/
│   │   ├── tables/              # Table editor, CSV import/export, table views
│   │   ├── relationship/        # Analysis report, assistant, and source review
│   │   ├── stakeholders/        # Stakeholder map and graph layout
│   │   └── enrichments/         # Enrichment column flows
│   ├── lib/api/                 # HTTP client and token handling
│   ├── pages/                   # App routes and public pages
│   ├── services/                # Typed API services
│   ├── stores/                  # Client-side state
│   └── styles/                  # Design tokens and global styles
├── apps/api/
│   ├── app/
│   │   ├── api/v1/              # FastAPI routes
│   │   ├── core/                # Configuration, errors, and logging
│   │   ├── models/              # SQLAlchemy models
│   │   ├── providers/           # Ollama, DaData, Nominatim, AI adapters
│   │   ├── repositories/        # PostgreSQL access
│   │   ├── schemas/             # Pydantic contracts
│   │   └── services/            # CSV, tables, and relationship analysis
│   ├── migrations/              # Alembic migrations
│   └── tests/                   # Backend tests and test database guard
├── examples/relationship/       # Sample relationship-analysis datasets
├── public/product/              # Product screenshots and static assets
├── docker/                      # Frontend image and SearXNG configuration
├── docker-compose.yml           # Local development stack
├── render.yaml                  # Render Blueprint
└── .env.example                 # Environment template
```

For backend-specific notes and sample relationship-analysis inputs, see [apps/api/README.md](apps/api/README.md) and [examples/relationship/README.md](examples/relationship/README.md). The API's generated OpenAPI schema is the source of truth for endpoint contracts.

## License

Sammi is distributed under the [Apache License 2.0](LICENSE).
