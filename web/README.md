# Ginomai Web

Independent browser release: scripture search (KJV and imported Bible JSON), song editing, service agendas, preview/take-live controls, one local projector output, IndexedDB saving, complete JSON backup/restore, and prepared offline loading. Optional email-code accounts add private song/service cloud backups. Basic usage statistics default to on when cloud features are configured and can be disabled in Privacy preferences; saved opt-outs are preserved. No account, desktop app, Node server, or cloud API is needed for local use. See [cloud setup](../supabase/README.md) before enabling production accounts.

Run `npm run preview:web`, then open `http://localhost:8700`. This builds and serves only the web export. The existing desktop server and desktop application are unaffected. Run `npm run build:web` to export `web/dist`, and `npm run test:web` for model, backup, build, and desktop packaging checks.

Deploy the **contents of web/dist** to HTTPS static hosting, at the root or within a directory. Use normal static-file serving (HTML, JavaScript modules, JSON, CSS, SVG, and `application/manifest+json`). Do not rewrite missing files to the app's index page. Serve `sw.js` with revalidation rather than a long immutable cache. No public deployment is performed by these commands.

## Operating a service

Add songs by pasting lyrics, with blank lines between sections. Each section is split into at most four lines per slide. Bible search accepts a reference such as `John 3:16-18` or words from a verse. Chapters can be browsed directly. Loading a passage/song or selecting a slide only cues it. **Take live** publishes it; Next/Previous move the cue. Hold live blocks taking another slide; Clear text and Blackout remain available.

Open the projector window on the same computer and browser profile, move it to the connected projector display, and enter fullscreen. The controller, preview, and output use Ginomai's existing projector renderer and local browser messaging. Output status reports receipt of state, not physical HDMI/projector health. OBS, other browser profiles/devices, phone-to-TV pairing, and cloud libraries require a later communication service and are not supported by this release.

Phone and tablet layouts support preparing and operating the local browser workspace. A phone does not automatically control another device's display. Use the validated computer + external-display workflow for projection; actual phone video-output adapters are device-dependent.

Choose **Prepare offline** while connected. It verifies cached controller/output assets, installs KJV into IndexedDB, saves services, and checks their dependencies. First loading/downloading still requires a connection. Once prepared, the same browser can reopen and present without internet. Export backups: browser storage remains user-clearable. Updates wait until controller and output windows close; they never force a reload during a service.

The `.ginomai` backup contains all saved services, songs, installed Bible data, and display preferences. Existing `.ginomia` backups can still be restored. Restore adds services, preserves existing song/Bible edits through remapped IDs, validates required passages, and commits the library and sessions in one database transaction. It does not change live output. Desktop `.sflow` files contain references rather than a complete library and cannot be restored as web backups. Songs JSON can be an array or `{songs:[...]}` with `title` and `lyrics` (or string `stanzas`). Bible JSON uses `{Book:{"1":[{"verse":1,"text":"..."}]}}`, optionally wrapped in `{name,data}`.

## Desktop isolation

Browser-specific code, tests, documentation, icons, and generated output live under `web/`, excluded from the desktop package. Shared cloud modules live under `js/` and are copied into the web export alongside their public configuration and CSS. The web build copies the desktop projector renderer and its dependencies and adapts **only that copy** to receive local browser state. No new production dependencies are introduced. The packaging test uses electron-builder's actual file matcher for Windows/macOS and bundled/cloud-content configurations. It proves zero web files enter the desktop payload; byte-identical installer size is not implied because package metadata/compression can differ.
