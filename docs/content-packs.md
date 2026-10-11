# Optional AI, Bible and Strong's downloads

KJV stays bundled. Desktop builds exclude other translations, Strong's dictionaries,
and the semantic ONNX model / verse index by default. Native AI runtime dependencies
remain bundled. Downloaded files live under `~/.ginomai/content-packs`, outside the
installation, so application updates keep them. `GINOMAI_CONTENT_DIR` can override
this location.

Content is hosted separately on the public GitHub prerelease:
https://github.com/EMWORLDLTD/Ginomai/releases/tag/content-v1.
The small trusted manifest shipped with the application pins the download URLs,
sizes and compressed / decompressed SHA-256 checksums. Users need no GitHub account.

The development checkout keeps its source datasets. Prompts appear only when the
requested pack is absent. Download buttons also require confirmation; no background
lookup or Settings visit starts a download. Starting speech recognition offers the
semantic pack once per app visit. Declining leaves transcription and explicit
scripture detection available. Settings > AI & Transcript shows availability,
download sizes, downloads and AI removal. Translations stay in the Bible repository.
User-facing descriptions show each pack's purpose without hosting or storage details.
Both AI and Strong's offer confirmed removal and can be downloaded again later.
Clear Bibles removes imported translations and downloaded Bible packs (including
Strong's) while retaining bundled KJV. Clear Everything also removes AI downloads,
saved sessions, transcript history and saved API keys. Uploaded media is kept by
default; its confirmation offers an unchecked **Also delete uploaded media** option.
Theme appearance and external exports are kept. Successful removal shows a toast;
full reset shows its result once after reloading. Cleanup waits for database commits and
file deletion before reporting success, and displays failures so users can retry.

A shared modal shows actual received bytes, verification, cancellation and retry.
Partial downloads are discarded and never served. Strong's installs its tagged KJV
and both dictionaries together. AI installs its license, model, tokenizer and KJV
verse index together. The semantic worker loads the downloaded folder with remote
model fetching disabled. Semantic results remain suggestions and cannot auto-project.
After installation these packs work offline; live speech transcription still uses
the user's selected speech provider.

## Prepare and publish content

1. Run `npm run build:content-packs` to generate immutable, hash-named compressed
   assets and manifest in `output/content-packs/`. The trusted manifest is also saved
   to `assets/content-packs/manifest.json`.
2. Upload new assets to the separate `content-v1` GitHub release, then upload the
   manifest. Preserve old immutable assets for existing app versions. Keep the
   content release a prerelease, separate from desktop updater releases.
3. To change the host, set `GINOMAI_CONTENT_BASE_URL` to the public HTTPS GitHub
   release asset base URL before generating packs. Never ship credentials.

## Installer packaging

`npm run dist:win` uses optional downloads by default. Mac build commands do the
same on a Mac. Packaging first verifies every published optional asset against the
trusted checksum; missing or mismatched hosting stops the build before excluding files.
The legacy `--cloud-content` flag remains accepted.
Use `npm run dist:win -- --bundled-content` for a fully bundled offline installer.
Each target keeps only its own native AI runtime. Previously built installers are
not modified by source changes.

## Verification

Run the focused content-pack, desktop-packaging, semantic-model-loading and
live-feed integration tests. Before distribution, check first-use consent,
cancellation, interrupted transfer / retry, offline relaunch, Strong's lookups,
AI removal / re-download, and desktop update on the target platform.
