# CURRENT STAGE

Step 6 — Enrichment Provider Architecture + DaData

# DONE

- Steps 1–5: FastAPI + PostgreSQL, JWT, workspaces, tables/columns/rows JSONB, CSV, credit ledger, Ollama generate/structured.
- Test isolation: `TEST_DATABASE_URL` → `sammi_test`. Destructive fixtures require `APP_ENV=test` and a `*_test` database name. No fallback to development `sammi`.
- Enrichment provider protocol + registry. DaData `company_by_identifier` via `POST /findById/party` (`branch_type=MAIN`).
- Migration `0005_enrichment`: `enrichment_runs`, `enrichment_attempts`, `cell_provenance`.
- Credits: reserve candidates → charge success only → release unused. Idempotent run key.
- Frontend: Add Column → Enrichment enabled, provider list from backend, Run selected, provenance from API, credit refresh. No fake provider Connected.

# IN PROGRESS

Nothing in Step 6.

# NEXT

STEP 7 — WATERFALL ENRICHMENT

# DATABASE

- `0005_enrichment`
- `enrichment_runs` (workspace/table/column FKs CASCADE; unique workspace+idempotency_key)
- `enrichment_attempts` (one row lookup = one attempt; cascade with run)
- `cell_provenance` UNIQUE(row_id, column_id); value stays in `table_rows.data`
- Indexes: runs(table_id, created_at), runs(workspace_id, created_at), attempts(run_id), attempts(row_id), provenance(row_id, column_id)

# PROVIDERS

- DaData: real. Backend-only `DADATA_API_KEY`.
- FNS/EGRUL, Kontur.Focus, SPARK, HH, 2GIS, Yandex Organizations: planned, not implemented, not shown as Connected.

# CREDITS

- Price from backend catalog (`DADATA_COMPANY_LOOKUP_CREDITS`), not from frontend/column payload at charge time.
- Success-only charge. Empty input skipped before reserve. not_found / no_value / error do not charge.
- Stale reservation reconciliation is future debt (sync runs lower the risk).

# TEST DATABASE

- `sammi` = development. `sammi_test` = pytest.
- Guard rejects TRUNCATE against `sammi`. Proven: marker row in `sammi` survives full pytest.

# API

- GET `/api/v1/enrichment/providers` — configured from env, available=null (no paid probe)
- POST `/api/v1/enrichment/providers/dadata/check` — explicit identifier, authenticated
- POST `/api/v1/tables/{id}/enrichment/columns`
- POST `/api/v1/tables/{id}/enrichment/runs` + Idempotency-Key
- GET run / attempts / table runs / cell provenance
- Viewer can read cells/provenance, cannot run

# TESTS

- Guard unit tests
- DaData mocked httpx: auth header, endpoint, MAIN branch, success, not_found, no_value, 401/403/429/5xx, timeout, invalid JSON
- Enrichment service: skip empty, reserve/charge/release, write value+provenance, not_found no write/charge, insufficient no provider calls, idempotency
- API: isolation 404, viewer 403, unconfigured run blocked, cascade delete
- Optional `pytest -m dadata` if `DADATA_INTEGRATION_TEST=true`

# KNOWN ISSUES

- Sync max 50 rows, no worker, no retry, one provider, no waterfall, no AI Column
- Ollama host may be offline; generation is separate from enrichment
- DaData live API not verified unless `DADATA_API_KEY` is set

# TECH DEBT

- Background jobs / ENRICHMENT_ASYNC_REQUIRED path
- Provider 429 retry
- Raw response retention (`ENRICHMENT_STORE_RAW_RESPONSES`)
- Run crash reconciliation daemon
- Waterfall multi-attempt execution (schema already allows attempt_index)

# ARCHITECTURE DECISIONS

- Provider abstraction so EnrichmentService has no `if provider == "dadata"` branches.
- DaData first: documented machine API, RU company data, no FNS HTML scrape.
- Provenance separate from JSONB cell values so Table Editor stays simple.
- Attempts persisted now so Step 7 Waterfall can attach attempt 2/3 without a rewrite.
- Credits success-only: Sammi pricing ≠ vendor API cost.
- Synchronous row limit: no Redis/workers yet; holding HTTP for 10k vendor calls is unsafe.
- Test DB isolation: TRUNCATE on `sammi` already destroyed real user tables; never again.
