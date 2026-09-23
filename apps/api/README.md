# FastAPI backend

Step 6: FastAPI, async SQLAlchemy, PostgreSQL, Alembic, passwordless JWT auth, workspaces, tables/columns/rows, CSV import/export, credit ledger, Ollama generation, DaData enrichment.

Real endpoints: health, auth, workspaces, tables, columns, rows, CSV preview/import/export, credits balance/history, AI provider status/models, Ollama test generation, enrichment providers/columns/runs/attempts/provenance. AI Column is not implemented.

Passwordless email login is a development/beta mechanism, not production auth.

## Test database

Pytest must use `sammi_test`, never development `sammi`. There is no fallback from `TEST_DATABASE_URL` to `DATABASE_URL`.

Native PostgreSQL:

```bash
psql -h localhost -d postgres -c "CREATE DATABASE sammi_test OWNER sammi;"
```

`.env`:

```bash
DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi
TEST_DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test
```

```bash
cd apps/api
DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test alembic upgrade head
TEST_DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test pytest
```

Destructive fixtures abort unless `APP_ENV=test` and the database name is `sammi_test` or ends with `_test`.

If Docker is available:

```bash
docker compose exec db psql -U sammi -d postgres -c "CREATE DATABASE sammi_test OWNER sammi;"
docker compose exec api alembic upgrade head
```

Host pytest cannot resolve Compose hostname `db`; `TEST_DATABASE_URL` with `@db:` is rewritten to `localhost`.

Optional live DaData tests (not in default pytest):

```bash
DADATA_INTEGRATION_TEST=true DADATA_API_KEY=... pytest -m dadata
```

Optional live Ollama tests:

```bash
OLLAMA_INTEGRATION_TEST=true pytest -m ollama
```

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
TEST_DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test pytest
```
