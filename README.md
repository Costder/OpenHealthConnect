# Open Health Connect

Open Health Connect is a **self-hostable companion service** for the Open Health Android app. It ingests encrypted health data bundles from local/private sync transports, stores them in SQLite, and exposes a local read-only API for agent consumers such as OpenClaw.

The service now also mirrors the current loopback contract used by [`Costder/Openhealth`](https://github.com/Costder/Openhealth/tree/main): it binds to `127.0.0.1:18432` by default and serves `/v1/health`, `/v1/snapshot`, `/v1/summary`, `/v1/workouts`, `/v1/nutrition`, `/v1/recovery`, and `/v1/prs`.

## v1 goals

- Single-user, self-hosted architecture
- SQLite-first (no Postgres)
- Local-only API by default (`127.0.0.1`)
- Privacy-first policy filtering (sensitive categories hidden from `/v1` by default)
- Stable interfaces within v1.x
- No vendor cloud dependency

## Stack

- TypeScript + Node.js
- Fastify
- SQLite (`sqlite3` + `sqlite`)
- Zod
- libsodium-wrappers
- chokidar

## Canonical ingest format (snapshot + delta)

Each bundle is a directory containing:

- `manifest.json`
- `payload.enc`

Manifest schema (v1):

- `formatVersion: 1`
- `bundleType: "snapshot" | "delta"`
- `bundleId: string`
- `sequence: integer`
- `prevBundleId?: string`
- `createdAt: ISO datetime`
- `transportMode: "syncthing" | "nextcloud" | "tailscale"`
- `integrity.algorithm: "sha256"`
- `integrity.ciphertextSha256: hex(64)`
- `encryption.algorithm: "xchacha20poly1305"`
- `encryption.nonceB64: base64`

`payload.enc` is XChaCha20-Poly1305 encrypted JSON: `{ "events": Event[] }`.

## CLI

```bash
ohc init [dataDir]
ohc serve
ohc status
ohc pair [base64key]
ohc policy show
ohc policy set <category...>
ohc rescan
ohc reindex
```

## API (read-only)

- `GET /health`
- `GET /v1/health`
- `GET /v1/context/agent` (primary endpoint)
- `GET /v1/snapshot`
- `GET /v1/summary`
- `GET /v1/events`
- `GET /v1/workouts`
- `GET /v1/nutrition`
- `GET /v1/recovery`
- `GET /v1/prs`
- `GET /v1/summaries/daily`
- `GET /v1/summaries/weekly`

## Quick start

```bash
npm install
npm run build
npm run init
node dist/src/cli.js init
node dist/src/cli.js serve
```

For the shortest first run on a fresh checkout:

```bash
npm install
npm run init
npm run dev
```

See `docs/transports.md` for transport setup and `docs/architecture.md` for module details.

## License

Open Health Connect is licensed under the GNU Affero General Public License v3.0.
See [LICENSE](./LICENSE).
