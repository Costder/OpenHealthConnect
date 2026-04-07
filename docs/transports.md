# Transport Setup (Syncthing, Nextcloud/WebDAV, Tailscale)

Open Health Connect consumes a local inbox folder. All transports should deliver bundle directories into:

`<dataDir>/inbox/<bundleId>/{manifest.json,payload.enc}`

## 1) Syncthing watched-folder mode

1. Install Syncthing on the Android device and host machine.
2. Create/choose an Android export folder for encrypted bundles.
3. Share/sync that folder to host path: `<dataDir>/inbox`.
4. Start OHC with `ohc serve`; watcher ingests arriving bundles automatically.

## 2) Nextcloud / WebDAV folder-sync mode

1. Configure Android app (or automation) to upload encrypted bundle folders to a Nextcloud path.
2. Sync Nextcloud folder to host local directory using Nextcloud desktop client.
3. Point local sync target to `<dataDir>/inbox` (or symlink into it).
4. OHC watcher detects manifests and ingests bundles.

## 3) Tailscale private node upload mode

1. Add Android and host to same Tailscale tailnet.
2. Use a private upload mechanism (SFTP/rsync/HTTPS uploader over tailnet) to place bundle folders into `<dataDir>/inbox`.
3. Keep host service bound to localhost; transport happens over Tailscale into local filesystem.
4. OHC watcher or `ohc rescan` performs ingestion.

## Security notes

- Preserve `manifest.json` + `payload.enc` atomicity per bundle directory.
- Never upload decrypted payloads.
- Keep pair key secret and rotate with `ohc pair` if needed.
