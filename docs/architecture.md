# Open Health Connect v1 Architecture

## Design constraints

- Single-user service
- Self-hosted and local-first
- SQLite-only in v1
- Agent API is read-only and lives under `/v1/`
- Highly sensitive categories are excluded by default
- Core modules remain agent-agnostic; OpenClaw uses the same public API as any consumer

## Core modules

- `src/config`: config schema + loader
- `src/db`: SQLite connection + migration runner
- `src/ingest`: manifest validation, integrity check, decryption, idempotent ingestion
- `src/summary`: daily + weekly summary generation
- `src/policy`: category sensitivity filtering
- `src/api`: Fastify read-only local API
- `src/watcher`: inbox filesystem watcher using chokidar
- `src/cli.ts`: operations workflow (init/serve/status/pair/policy/rescan/reindex)

## Reliability and safety properties

- Migration and ingest operations use explicit SQLite transactions.
- Bundle ingestion is idempotent (`ingested_bundles.bundle_id` unique).
- Snapshot bundles clear existing event state; delta bundles append by unique event ID.
- Integrity hash validation occurs before decryption.
- Default network bind is localhost (`127.0.0.1`).

## Stable v1 interfaces

- Bundle format version is fixed at `formatVersion = 1`.
- API namespace is stable under `/v1/*`.
- CLI commands listed in README are supported in v1.x.
