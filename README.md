# Платформа

Российский B2B GTM / enrichment / revenue intelligence SaaS. Spreadsheet-first workspace: компании, люди, waterfall, AI-research, сигналы и активация.

## Product

Пользователь ведёт рынок в таблицах. Главный экран — Table Editor. Продукт ощущается как GTM Intelligence Operating System: landing рассказывает путь от сырых данных к действию, приложение остаётся плотным рабочим инструментом.

## Frontend architecture

React 19 + TypeScript + Vite + React Router. Next.js runtime удалён. Mock services в `src/services/` — будущая точка замены на FastAPI clients. Компоненты не знают transport.

## React/Vite migration

App Router, `next/link`, `next/image`, Server Components и `NEXT_PUBLIC_*` заменены на Vite + React Router. Переменные: `VITE_API_URL`, `VITE_ENABLE_DEMO_DATA`.

## Routes

```text
/                      landing
/product /solutions /integrations /security /pricing /docs
/login                 passwordless email → FastAPI JWT (beta)
/app
/app/tables
/app/tables/:id
/app/people /companies /audiences /signals /agents
/app/campaigns /integrations /usage /settings
```

Демо-роут `/app/tables/demo-russian-saas` не входит в normal flow. Без `VITE_ENABLE_DEMO_DATA=true` показывает «Demo data disabled».

## Auth Development Flow

`/login` принимает только email. Это **beta passwordless**, не production auth: пароля, magic-link и OAuth нет.

1. `POST /api/v1/auth/login` `{ "email": "..." }`
2. FastAPI нормализует email, находит или создаёт `users`
3. Для нового пользователя в одной транзакции создаются `workspaces` («Мой workspace») и `workspace_members` (role `owner`)
4. Ответ: JWT + user
5. Frontend кладёт JWT в `localStorage` (`sammi.access_token`) — временное решение для SPA
6. `GET /api/v1/auth/me` и `GET /api/v1/workspaces`
7. Redirect `/app`

Reload страницы снова вызывает `/auth/me`. Невалидный token → `/login`. Выйти вызывает `POST /api/v1/auth/logout` и удаляет token локально (JWT stateless).

Повторный login с тем же email не создаёт второго user/workspace.

## AI Providers

Backend registry: Ollama (local default), Yandex AI Studio, GigaChat.

Secrets только в backend env. Frontend: Settings → AI Providers показывает Configured / Available, capabilities и (для Ollama) установленные модели. React не ходит в Ollama напрямую.

- Ollama: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_SECONDS`
- Yandex: `YANDEX_AI_API_KEY`, `YANDEX_AI_PROJECT_ID`, `YANDEX_AI_BASE_URL`
- GigaChat: `GIGACHAT_AUTH_KEY`, `GIGACHAT_SCOPE`, `GIGACHAT_BASE_URL`, `GIGACHAT_AUTH_URL`

Если ключ пустой, приложение стартует, provider `configured=false`. Если Ollama не запущен, FastAPI остаётся healthy, provider `available=false`. Нет автоматического fallback на Yandex/GigaChat.

Yandex и GigaChat на Step 5: health / OAuth only. Generation — 501.

AI Column ещё не подключён к Table Editor.

## Credits

Настоящий ledger, не `workspace.credits`. Один workspace = один `credit_accounts`. Операции пишутся в append-only `credit_transactions`.

```text
Workspace
  → CreditAccount (available, reserved)
    → CreditTransaction (grant / reserve / charge / release / refund / adjustment)
```

Семантика: GRANT увеличивает available; RESERVE переносит available → reserved; CHARGE списывает reserved; RELEASE возвращает reserved → available; REFUND увеличивает available.

Инварианты: `available >= 0`, `reserved >= 0`. RESERVE не больше available, CHARGE/RELEASE не больше reserved. Мутации идут в транзакции с `SELECT … FOR UPDATE` по account row.

Первый `GET /credits` создаёт account и одно ledger-событие `grant` на `CREDITS_INITIAL_GRANT` (по умолчанию 1000). Повторный GET не создаёт второй grant. Existing workspaces получают account lazy, без зашитого grant в миграции.

Публичные POST grant/charge/refund нет. Development-only: `POST /api/v1/dev/workspaces/{id}/credits/grant` регистрируется только при `APP_ENV=development`.

Ollama test generation credits не списывает.

## Ollama

Локальный native API: `GET /api/tags`, `POST /api/chat` (`stream=false`). Auth не нужен. Модель не скачивается автоматически.

Два режима:

- FastAPI на хосте: `OLLAMA_BASE_URL=http://localhost:11434`
- FastAPI в Docker на macOS, Ollama на хосте: `OLLAMA_BASE_URL=http://host.docker.internal:11434`

Установка и pull моделей — операционная задача, см. [Ollama docs](https://docs.ollama.com). Compose-сервис Ollama не добавляется.

Проверка: Settings → AI Providers → Ollama → Test generation. Промпт серверный (`Ответь одним словом: OK`). Structured output (`format` = JSON Schema) есть в provider, в UI не выведен.

## FastAPI

`apps/api/` — FastAPI, async SQLAlchemy, PostgreSQL, Alembic.

Реальные endpoints: health, auth, workspaces, tables/columns/rows, CSV import/export, credits balance/history, AI provider status/models, Ollama test generation, enrichment providers/columns/runs/provenance. AI Column API нет.

## Tables Architecture

Первая продуктовая сущность: **table внутри workspace**.

```text
User (JWT)
  → Workspace membership
    → Table
      → Columns (metadata)
      → Rows (одна PostgreSQL-запись, cell values в JSONB)
```

- `tables` — имя, `object_type` (`company` | `person` | `custom`), `workspace_id`, `created_by`
- `table_columns` — имя, type, position, `config` JSONB
- `table_rows` — `position`, `data` JSONB с ключами = UUID колонок

Нет отдельной SQL-таблицы на каждую пользовательскую spreadsheet и нет `table_cells`. Rename колонки не ломает данные.

## Tables API

```text
GET/POST  /api/v1/workspaces/{workspace_id}/tables
GET/PATCH/DELETE  /api/v1/tables/{table_id}
GET/POST  /api/v1/tables/{table_id}/columns
PATCH/DELETE  /api/v1/tables/{table_id}/columns/{column_id}
POST  /api/v1/tables/{table_id}/columns/reorder
GET/POST  /api/v1/tables/{table_id}/rows
PATCH/DELETE  /api/v1/tables/{table_id}/rows/{row_id}
POST  /api/v1/workspaces/{workspace_id}/imports/csv/preview
POST  /api/v1/workspaces/{workspace_id}/imports/csv
POST  /api/v1/tables/{table_id}/imports/csv/preview
POST  /api/v1/tables/{table_id}/imports/csv
GET   /api/v1/tables/{table_id}/export.csv
GET   /api/v1/workspaces/{workspace_id}/credits
GET   /api/v1/workspaces/{workspace_id}/credits/transactions
GET   /api/v1/system/ai/providers
GET   /api/v1/system/ai/providers/{provider_id}/models
POST  /api/v1/system/ai/providers/{provider_id}/check
POST  /api/v1/system/ai/providers/ollama/test
GET   /api/v1/enrichment/providers
POST  /api/v1/enrichment/providers/dadata/check
POST  /api/v1/tables/{table_id}/enrichment/columns
POST  /api/v1/tables/{table_id}/enrichment/runs
GET   /api/v1/tables/{table_id}/enrichment/runs
GET   /api/v1/enrichment/runs/{run_id}
GET   /api/v1/enrichment/runs/{run_id}/attempts
GET   /api/v1/tables/{table_id}/rows/{row_id}/columns/{column_id}/provenance
```

Создать таблицу: `{ "name": "Компании", "object_type": "company" }`. `created_by` берётся из JWT.

Список таблиц возвращает реальный `row_count` / `column_count` (не N+1). Rows paginated: `?limit=200&offset=0`, max 500.

PATCH row делает merge JSONB. `null` очищает значение.

## Column Types

Step 3: `text`, `number`, `boolean`, `date`, `url`, `email`, `phone`, `select`. Step 6: `enrichment`.

UI может показывать Formula / Waterfall / AI Column как «Скоро». Backend такие типы отвергает (`INVALID_COLUMN_TYPE`). Смена type после создания не поддерживается.

## Enrichment

Первый настоящий внешний data provider: **DaData**, операция `company_by_identifier` (`POST /findById/party`, `branch_type=MAIN`).

```text
React
  → FastAPI
    → EnrichmentService
      → Provider Registry
        → DaDataEnrichmentProvider
          → DaData API
            → normalized result
              → PostgreSQL (row JSONB + provenance + attempts)
```

Ключ `DADATA_API_KEY` живёт только на backend. Если пустой, provider `configured=false` («Не настроен»), run возвращает `ENRICHMENT_PROVIDER_NOT_CONFIGURED`. Нет fake Connected и нет fake company data.

**Поля:** company_name, company_short_name, inn, kpp, ogrn, status, address, management_name, management_post, okved, revenue. Catalog приходит с backend capabilities, React его не хардкодит.

**Credits:** только successful result. Empty input → skip, без API call. not_found / no_value / error не списывают. Flow: reserve candidates → provider calls → charge successes → release unused. Цена `DADATA_COMPANY_LOOKUP_CREDITS` (internal unit, не тариф DaData).

**Sync limit:** `ENRICHMENT_SYNC_MAX_ROWS=50`. Больше → `ENRICHMENT_ASYNC_REQUIRED`. Concurrency: `ENRICHMENT_PROVIDER_CONCURRENCY=5`. Retries нет.

**Provenance** отдельно от `table_rows.data`: `cell_provenance` UNIQUE(row_id, column_id). Attempts пишутся всегда (задел под Waterfall, сам Waterfall не реализован).

**Delete:** table/column cascade удаляет runs/attempts/provenance. Run history не audit log.

Optional live test (не в default pytest): `DADATA_INTEGRATION_TEST=true DADATA_API_KEY=... pytest -m dadata`.

## Test database

Pytest **никогда** не использует development `sammi`. Destructive fixtures требуют `APP_ENV=test` и имя БД `sammi_test` или `*_test`. Fallback `TEST_DATABASE_URL` → `DATABASE_URL` запрещён.

Native PostgreSQL:

```bash
psql -h localhost -d postgres -c "CREATE DATABASE sammi_test OWNER sammi;"
```

```bash
# .env
TEST_DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test
DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi
```

```bash
cd apps/api
DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head
TEST_DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test pytest
```

Docker (если демон доступен): тот же `CREATE DATABASE` через `docker compose exec db psql ...`. Compose hostname `db` в TEST_DATABASE_URL на хосте переписывается в `localhost`.

## Row JSONB storage

```json
{ "0385…column-uuid": "Selectel", "7321…column-uuid": 520 }
```

API никогда не возвращает orphaned keys. При delete column ключ удаляется из JSONB.

## Pagination

Offset pagination для beta. Search/filter/sort в редакторе — client-side по загруженной странице, не по всей базе. Cursor pagination — later.

## Workspace Isolation

Нельзя открыть table по UUID без membership. Чужой workspace получает `404 TABLE_NOT_FOUND`. Viewer — read only (`403 TABLE_ACCESS_DENIED`). Delete table — owner/admin.

## How to create first real table

1. Login на `/login`
2. `/app/tables` → Import CSV или Создать таблицу
3. Preview → mapping → Импортировать
4. Откроется `/app/tables/<uuid>`
5. Edit cells, reload — данные в PostgreSQL
6. Export CSV скачивает всю таблицу

Swagger: login → token → workspace → preview CSV → import → export.csv.

## CSV Import / Export

Первый полезный beta-workflow: upload CSV → preview → mapping → import в PostgreSQL → Table Editor → export CSV.

**Limits (config):** `CSV_MAX_FILE_SIZE_MB=10`, `CSV_MAX_ROWS=10000`, `CSV_PREVIEW_ROWS=20`.

**Encodings:** UTF-8, UTF-8 BOM, CP1251. Иначе `CSV_ENCODING_UNSUPPORTED`.

**Delimiters:** comma, semicolon, tab. Detection через `csv.Sniffer` + fallback. Пользователь может задать delimiter явно и перезапросить preview.

**Preview** ничего не пишет в БД. Backend — source of truth (frontend CSV не парсит).

**Mapping** по CSV column index: create / existing (column UUID) / skip. Имена заголовков не являются identity.

**Validation:** strict, all-or-nothing. Одна невалидная ячейка — весь import rollback. Первые 50 ошибок в `CSV_VALIDATION_FAILED`.

**Create table from CSV:** `POST /workspaces/{id}/imports/csv` создаёт table + columns + rows в одной транзакции. Имя по умолчанию — filename без расширения. `object_type` default `custom`.

**Existing table:** append-only, без dedupe/upsert. Viewer не может import. Owner/admin/member могут.

**Export:** `GET /tables/{id}/export.csv` стримит все rows (не только page 200). Headers = `column.name` в порядке `position`. UTF-8, BOM default on. Delimiter default **comma** (`?delimiter=semicolon`). `safe_for_spreadsheets=true` по умолчанию префиксует `'` у значений, начинающихся на `= + - @` (числа не трогает). Filename из имени таблицы, без path traversal. Viewer может export.

**Не поддерживается:** XLSX, Google Sheets, background/job import, merge/upsert, dedupe, import history.

## Design system

Единый визуальный язык для Landing, Login и App. Источник: `SKILL-feelistic-aries.md` (HYBRID: 60% Feelistic discipline × 40% Aries atmosphere).

Токены: `src/styles/tokens.css`. Motion: `src/lib/motion/tokens.ts`. Шрифты: Instrument Sans, Instrument Serif (только editorial), IBM Plex Mono (технические значения).

Landing — cinematic dark emerald. App — warm ivory. Dark app theme использует ту же emerald-семью, что marketing canvas. Teal — action/selection. Champagne — редкий verified signal, не вторая primary.

## SKILL-feelistic-aries.md

Primary design source of truth в корне репозитория. Palette, typography, motion grammar, section archetypes, anti-generic rules и quality gates читаются оттуда. Feature behaviour прототипа сохраняется, визуальный конфликт решается в пользу skill.

## Development

Нужны Docker и Node.js.

```bash
cp .env.example .env
docker compose up --build
docker compose exec api alembic upgrade head
```

- Frontend: http://localhost:3000
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

Миграции не запускаются автоматически при старте контейнера. `alembic upgrade head` безопасен, если база уже на head.

Локальный Vite, если API и Postgres уже в Docker:

```bash
npm install
npm run dev
```

```bash
docker compose ps
docker compose exec api alembic current
docker compose exec api pytest
npm run lint
npm run typecheck
npm run build
npm run preview
npm run capture:screens
```

## Environment

Смотри `.env.example`. `.env` не коммитится.

```bash
VITE_API_URL=http://localhost:8000
VITE_ENABLE_DEMO_DATA=false
```

`VITE_ENABLE_DEMO_DATA=true` включает старые fixtures. По умолчанию списки в `/app` пустые. Browser ходит в API по `http://localhost:8000`. Контейнер API ходит в Postgres по hostname `db`. Pytest с хоста использует `localhost:5432` (см. `apps/api/README.md`).

## Known limitations

- Search / filter / sort в Table Editor работают только по загруженной странице rows (до 200), не по всей базе. CSV export читает всю таблицу на backend.
- Views не персистятся: новая таблица имеет только «Все».
- Concurrent cell edits: last-write-wins, без optimistic concurrency.
- Billing, waterfall, AI Column, XLSX, CRM — не реализованы и не показывают fake success.
- Enrichment синхронный, max 50 rows, один provider (DaData), без retry и без worker.
- Type колонки после создания менять нельзя.
- CSV import синхронный до 10k rows; большие файлы → future job queue.

## Troubleshooting

- `503` / `DATABASE_UNAVAILABLE`: Postgres не готов или неверный URL. `docker compose ps`, `docker compose logs api`.
- CORS: origin фронтенда должен быть в `CORS_ORIGINS` (`http://localhost:3000`).
- Порт 3000 занят локальным `npm run dev` — не поднимайте второй frontend.
- Docker Desktop не стартует (например, `Failed to install Rosetta`): поднимите PostgreSQL 16 локально и из `apps/api` запустите `DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi .venv/bin/uvicorn app.main:app --port 8000`. В `.env` для Compose хост базы — `db`, для процесса на хосте — `localhost`.
- Данные Postgres живут в volume `postgres_data`. `docker compose down -v` удаляет volume.

## Build

Production bundle собирается Vite в `dist/`. Скриншот-скрипт в бандл не входит.

## Screenshot capture

Требует запущенный dev server. `CAPTURE_BASE_URL` по умолчанию `http://localhost:3000`.

Landing использует реальные снимки текущего UI, а не fake dashboard.

```bash
npm run dev
npm run capture:screens
```

Playwright (вне production bundle) ставит mock session, открывает рабочие маршруты и пишет PNG в `public/product/` (1440×900, light product mode): dashboard, tables, table-editor, add-column, waterfall, ai-column, run-state, signals, integrations, audiences.
