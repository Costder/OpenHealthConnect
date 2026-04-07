# Transport Setup (Syncthing, Nextcloud/WebDAV, Tailscale)

Open Health Connect consumes a local inbox folder. All transports should deliver bundle directories into:

`<dataDir>/inbox/<bundleId>/{manifest.json,payload.enc}`

## 1) Syncthing watched-folder mode

1. Install Syncthing on the Android device and host machine.
2. Run `ohc pair qr folder-sync syncthing` on the host and scan the QR in the Android app.
3. Create/choose an Android export folder for encrypted bundles.
4. Point Android at the Syncthing-shared folder using the document-tree picker.
5. Share/sync that folder to host path: `<dataDir>/inbox`.
6. Start OHC with `ohc serve`; watcher ingests arriving bundles automatically.

## 2) Nextcloud / WebDAV folder-sync mode

1. Run `ohc pair qr folder-sync nextcloud` on the host and scan the QR in the Android app.
2. Choose a writable Nextcloud/WebDAV-backed folder in the Android document picker.
3. Sync that folder to the host local directory using the Nextcloud desktop client.
4. Point local sync target to `<dataDir>/inbox` (or symlink into it).
5. OHC watcher detects manifests and ingests bundles.

## 3) Tailscale private node upload mode

1. Run `ohc pair qr folder-sync tailscale` on the host and scan the QR in the Android app.
2. Add Android and host to same Tailscale tailnet.
3. Export encrypted bundle folders from Android using transport mode `tailscale`.
4. Use a private upload mechanism (SFTP/rsync/HTTPS uploader over tailnet) to place bundle folders into `<dataDir>/inbox`.
5. Keep host service bound to localhost; transport happens over Tailscale into local filesystem.
6. OHC watcher or `ohc rescan` performs ingestion.

## Security notes

- Preserve `manifest.json` + `payload.enc` atomicity per bundle directory.
- Never upload decrypted payloads.
- Keep pair key secret and rotate with `ohc pair` if needed.
- Use `ohc pair qr <transportMode>` when onboarding a new Android device so the shared key and preferred transport mode do not need to be handled manually.

## Direct upload mode

If you want scan-to-pair without selecting a shared folder, use:

1. Start OHC on a host URL the Android device can reach.
2. Run `ohc pair qr direct http://YOUR-HOST:18432`.
3. Scan that QR in the Android app.
4. The app can then upload encrypted bundles directly to `POST /v1/direct-upload`.
