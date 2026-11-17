# Backend contract: Stakeholder Map

This is a proposed contract. No stakeholder-map endpoints or PostgreSQL entities currently exist in `apps/api`; the frontend uses a namespaced local demo repository and must not present it as server persistence or a live CRM connection.

## Proposed resources

- `GET /api/v1/accounts` — workspace-scoped accounts with stable internal ID and optional CRM external ID.
- `GET /api/v1/accounts/{account_id}/stakeholders` — account summary, contacts, typed relationships, assessments, interactions, source provenance, and `fetched_at`.
- `PATCH /api/v1/accounts/{account_id}/contacts/{contact_id}` — editable title/department and assessment fields. Assessment fields should include role, influence (nullable 1–5), stance, relationship strength, evidence, evaluator, and evaluated timestamp.
- `POST /api/v1/accounts/{account_id}/relationships` and `PATCH /api/v1/accounts/{account_id}/relationships/{relationship_id}` — type, direction, strength, confidence, evidence, source, and timestamps. Reject self-links, cross-account endpoints, and duplicate directed/type tuples.
- `POST /api/v1/accounts/{account_id}/interactions` — participant contact IDs, type, occurred_at, summary, author ID, visibility, source, and optional CRM external ID. Recompute contact last interaction from persisted events.
- `GET /api/v1/accounts/{account_id}/crm-sync/preview` — inbound snapshot version, local changes, and pending outbox events.
- Future explicit sync command — apply only supported fields to a configured mock/real connector and persist `pending | synced | failed` events. Do not include an apply button before this exists.

## Storage and authorization

Use workspace-scoped PostgreSQL entities for accounts, contacts, initiatives, assessments, relationships, interactions, provenance, and sync events. Preserve the source-of-truth distinction: company/contact/title/department and imported activity may originate in CRM; decision role, influence, stance, relationship graph, and evidence are Sammi assessments unless a connector explicitly supports writing them. A viewer may read but cannot mutate. Verify workspace membership and account ownership on every request.

## Validation and errors

Use the existing FastAPI error envelope and request IDs. Return `404` for resources outside the caller's workspace, `403` for viewer mutations, `409` for version conflicts/duplicate edges, `422` for invalid ranges or relationships, and `503` for unavailable CRM providers. Keep unsaved client state intact on errors. Make interaction creation idempotent with an `Idempotency-Key`.

## Migration sequence

1. Add workspace-scoped accounts and contacts (or explicit links to future company records) with CRM external IDs and unique constraints.
2. Add initiative-specific assessments and typed relationships with confidence/evidence fields.
3. Add interactions and source provenance, with participant join table and timeline indexes.
4. Add sync outbox/inbox records with retry/error metadata and connector version.
5. Add schemas, repositories, services, authenticated routes, permission coverage and tests isolated to `sammi_test`.

Map current `StakeholderSnapshot` contracts in `src/features/stakeholders/repository.ts` to API DTOs in `src/services/` once the backend is implemented. Do not reuse the geographic table map endpoint.
