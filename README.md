# Ginomai

> **The Word in Motion**

Next-Generation Church Presentation, Multi-Monitor Projection & Broadcast Media System.

---

## Highlights

- **0ms Tactile Latency**: Instantaneous slide switching, verse transitions, and agenda sequencing.
- **Presenter Studio & Multi-Display Engine**: Native multi-monitor projection, OBS NDI/browser integration, Lower-Thirds, and sanctuary projection.
- **Bento & Modern Workstation**: High-contrast, hardware-accelerated interface without GPU-heavy blur bottlenecks.
- **Embedded Broadcast Server**: Serves mobile and tablet remote operator consoles over LAN.
- **Automated Over-The-Air (OTA) Updates**: Differential background updates powered by `electron-updater` and GitHub Releases.

---

## Desktop Development & Building

### Product landing page

Open `http://localhost:8500/landing.html` with the development or studio server running.
The landing page includes an interactive presentation preview and links to the studio.

### Browser development with automatic reload

Run `npm run dev` and open `http://localhost:8500`. Saving frontend files
automatically reloads open pages. Changes to `server.js` or the reload helper
restart the development server and reload pages after reconnection.
Reloading can discard unsaved form edits; use `npm run server` or `npm start`
for live services, where automatic reload is disabled.

### Operator workflow and reliability

- Open the host console on the presentation computer at `http://localhost:8500`.
  Host credentials are issued only to a local console and are held in an
  HttpOnly, SameSite cookie. Remote devices use the operator link from Broadcast Hub.
- Start remote control in Broadcast Hub and give the operator the six-digit
  pairing code shown there. Pairing lasts for that server session; stopping
  remote control or restarting the server revokes operator credentials.
  The legacy `/remote.html` link redirects to the pairing-enabled operator page.
- Choose **Settings → Hotkeys & Control → Slide selection** for optional
  **Preview → Take live** operation. Instant click-to-project remains the default.
  Armed Auto-project sends detected content live automatically.
- **Hold live** prevents slide changes, including remote projection and navigation.
  **Clear text** clears the outputs without rebuilding the current deck.
- Output badges distinguish connected display browsers from receipt of the
  latest state. They do not verify the physical projector, HDMI cable, or OBS scene.
- The session pill shows Saved, Saving, or Not saved. A persistent save failure
  offers Retry and Export copy. Failed saves block switching sessions.
- Dialogs contain keyboard focus; Escape closes them and restores focus.
  Setup tools live under Tools; reset actions are in Settings → Help.

Run `npm test` for isolated permission, save-failure, output-status, dialog,
and projection regressions. Integration tests use an ephemeral local server and
do not change a running service. Use the normal server or desktop app for services,
and verify the physical outputs before an event. The HTTP LAN server is intended
for a trusted local network, not public Internet exposure.

### Run Locally (Desktop)
```bash
npm start
```

### Build Installers (Local)
```bash
npm run dist:win
npm run dist:mac:apple
npm run dist:mac:intel
```

The branded installers use Ginomai's compact feature showcase and offline setup.
See [installer build and validation notes](docs/installer.md). Use
`npm run installer:preview` for a read-only preview of the setup interface.

### Publish Over-The-Air (OTA) Release
```powershell
$env:GH_TOKEN="your_github_token"
npm run dist:publish
```
