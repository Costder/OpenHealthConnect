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
ohc config show
ohc config set host 0.0.0.0
ohc config set port 18432
ohc pair [base64key]
ohc pair qr [syncthing|nextcloud|tailscale]
ohc pair qr folder-sync [syncthing|nextcloud|tailscale]
ohc pair qr direct <hostUrl>
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

## Self-host in 3 minutes

This is the fastest verified path for direct pairing from the Open Health Android app to your own Open Health Connect host.

```bash
npm install
npm run build
node dist/src/cli.js init
node dist/src/cli.js config set host 0.0.0.0
node dist/src/cli.js serve
```

In a second terminal:

```bash
node dist/src/cli.js pair qr direct http://YOUR-HOST-IP:18432
```

In the Android app:

- scan the QR
- grant the requested permissions
- tap `Export Now`

Verify that data arrived:

```bash
node dist/src/cli.js status
```

Expected:

- `bundles` is greater than `0`
- `events` is greater than `0`

Optional API checks:

```bash
curl.exe "http://127.0.0.1:18432/v1/health"
curl.exe "http://127.0.0.1:18432/v1/summary"
curl.exe "http://127.0.0.1:18432/v1/snapshot?date=YYYY-MM-DD"
```

Notes:

- Use your actual LAN IP such as `192.168.x.x`, not `127.0.0.1`, when generating a direct QR for a phone.
- `curl.exe` is preferred in PowerShell because `curl` is aliased to `Invoke-WebRequest`.
- If you want the manual privacy-focused path instead, use `pair qr folder-sync ...` and a shared folder transport.

## Quick start

For the shortest local first run on a fresh checkout:

```bash
npm install
npm run init
npm run dev
```

When you run `init`, the CLI prints:

- the host inbox path the Android-exported bundles need to reach
- the exact `pair qr` command to run
- the default Syncthing pairing QR directly in the terminal when stdout is interactive
- the next commands to start the service and verify ingest

## Config

Show the current host bind, port, inbox path, and direct-upload availability:

```bash
node dist/src/cli.js config show
```

Set a reachable bind address for direct pairing from another device:

```bash
node dist/src/cli.js config set host 0.0.0.0
```

Change the port if needed:

```bash
node dist/src/cli.js config set port 18432
```

See `docs/transports.md` for transport setup and `docs/architecture.md` for module details.

## Pairing modes

Open Health Connect now supports two pairing modes:

- `folder-sync`
The Android app scans the QR, stores the shared encryption key, and then writes encrypted bundle folders to a user-selected export folder. Syncthing, Nextcloud / WebDAV, or Tailscale can move those folders to the host inbox.

- `direct`
The Android app scans the QR, stores the shared encryption key plus direct host details, and then uploads encrypted bundles directly to OHC with no folder picker.

### Direct pairing

Use this when you want `scan QR -> paired -> upload directly to host`.

```bash
node dist/src/cli.js config set host 0.0.0.0
node dist/src/cli.js serve
node dist/src/cli.js pair qr direct http://YOUR-HOST:18432
```

Requirements:

- Android stores the pairing key
- Android stores the direct host URL and upload token
- Android can export directly to OHC with no shared folder requirement
- the host URL in the QR must be reachable from the Android device
- OHC accepts direct uploads at `POST /v1/direct-upload`

### Folder-sync pairing

Use this when you want a manual or more privacy-focused transport layer outside OHC.

```bash
node dist/src/cli.js serve
node dist/src/cli.js pair qr folder-sync syncthing
```

Other examples:

```bash
node dist/src/cli.js pair qr folder-sync nextcloud
node dist/src/cli.js pair qr folder-sync tailscale
```

Requirements:

- Android stores the pairing key
- Android asks for an export folder
- encrypted bundle directories eventually land in `<dataDir>/inbox`

## License

Open Health Connect is licensed under the GNU Affero General Public License v3.0.
See [LICENSE](./LICENSE).
