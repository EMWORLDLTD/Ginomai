# Branded Ginomai installers

Setup uses the approved compact dark/purple design, with three feature slides
and installation progress. The 840 × 570 window grows only when Details opens.
Slides update in place, can be paused, and respect reduced motion. Setup needs
no network connection: fonts, interface and installation payloads are local.

## Build

Install project dependencies with `npm ci` first:

```sh
npm run dist:win
npm run dist:mac:apple
npm run dist:mac:intel
```

Build macOS on a Mac. Cross-building Windows requires the normal electron-builder
prerequisites. Artifacts are written to `installers/`:

- `Ginomai-Setup-<version>-win-x64.exe`: branded Windows setup.
- `Ginomai-Setup-<version>-mac-arm64.dmg`: Apple Silicon setup.
- `Ginomai-Setup-<version>-mac-x64.dmg`: Intel Mac setup.
- Native NSIS, portable Windows and macOS ZIP artifacts remain available for
  fallback installation and the app's existing updater.

On macOS, open the DMG and double-click **Install Ginomai**. Setup copies Ginomai
into Applications. If `/Applications` is not writable, it defaults to the user's
`~/Applications`; Details → Change selects another parent folder.
On Windows, run the branded EXE and click **Install Ginomai**. Setup defaults to
the current user's application folder. The embedded NSIS installer maintains
Windows uninstall entries, shortcuts and upgrade logic.

Windows shows an activity bar during native installation: NSIS does not expose
reliable extraction percentages. macOS measures bytes in the staging bundle.
Both show 100% only after verifying the installed app archive. Windows also
verifies the embedded installer SHA-256 before execution. macOS copies with
`ditto` to preserve modes, symlinks and signing metadata, verifies signed bundles,
and stages updates before replacing the existing Ginomai bundle. An unrelated
app is never replaced. Close Ginomai before a Mac update.
Setup cannot close during installation but can minimize. Errors remain visible
and can be retried. **Open Ginomai** launches the installed app.

## Preview and validation

```sh
npm run installer:preview
node --test tests/installer.test.js
```

Preview is read-only. To preview in a browser, serve `electron/installer/` and open
`index.html?platform=win32` or `index.html?platform=darwin`. Installation is disabled
without the Electron bridge.

## Distribution

The separate Electron setup runtime adds download size, without adding a second
runtime to the installed application. Both payload and setup require platform
signing for production distribution; macOS releases also need Apple notarization.
Configure standard electron-builder signing credentials on the release machine.
The DMG is created locally with `hdiutil`; sign/notarize the final distribution
image as part of the release process.
Local unsigned builds are for testing.

`dist:publish` retains native updater publishing. Branded setup artifacts stay
local for distribution after platform smoke tests. `--native-only` builds native
artifacts without wrapping them. The wrapper version comes from the root package.

Standard app builds keep their GitHub update feed even when upload is disabled.
Use `node scripts/build-desktop.js --cloud-content --native-only` to prepare the
Windows installer, blockmap and `latest.yml` locally. Upload those three files to
a stable app release with a higher version than the installed app; keep the
content-packs release separate. Earlier local installers built without an update
feed need one manual installation of 2.4.1 before future automatic updates work.

Before release, test a clean install, upgrade, selected folder, shortcut off/on,
retry after failure, app launch, and Windows uninstall on actual platform hardware.
Unsigned local builds do not validate Gatekeeper or Windows trust checks.
