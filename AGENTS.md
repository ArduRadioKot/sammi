Frontend — React + Vite + TypeScript. Backend — FastAPI + PostgreSQL в `apps/api`.

Не добавлять Next.js. Table Editor не удалять. Product data по умолчанию пустая (`VITE_ENABLE_DEMO_DATA=false`). Auth — passwordless email JWT (beta). Tables / columns / rows — FastAPI + PostgreSQL, не mock. CSV import/export реальные. Credits — ledger в PostgreSQL. Ollama generation реальный. Enrichment — FastAPI → DaData, не React → DaData. AI Column и Waterfall не реализовывать до следующих шагов. Pytest только против `sammi_test` (`TEST_DATABASE_URL`), никогда против `sammi`.
