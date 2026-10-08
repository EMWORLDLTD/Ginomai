# Optional Bible and Strong’s downloads

KJV stays bundled. The optional cloud-content desktop build excludes the other
translations and the Strong’s dictionaries. Downloaded files live under
`~/.ginomai/content-packs`, outside the application installation. Desktop updates
do not remove them. `GINOMAI_CONTENT_DIR` can override this location.

The first content release is published at
https://github.com/EMWORLDLTD/Ginomai/releases/tag/content-v1. The bundled manifest
now points to its public download URL. Pack generation preserves this URL unless
an explicit replacement is supplied. A cloud-content build uses this saved URL
when no environment override is provided.

The current development checkout still contains every Bible, so selecting one
here normally reads its bundled copy without a download prompt. The optional
download flow applies when a pack is absent, as in the future smaller installer.

The local development checkout keeps all source datasets, so it remains usable
offline. First-use prompts appear when optional files are actually absent.
Background verse lookups never start a download. The download button itself
authorizes a download without a second prompt. Strong’s downloads its tagged Bible
and both dictionaries as one transaction. Network progress reports actual received
bytes; incomplete downloads are never served. Compressed and decompressed SHA-256
checksums are pinned by the small manifest bundled with the application.

## Prepare and publish

1. Run `npm run build:content-packs`. This creates individually compressed files
   and a manifest in `output/content-packs/`, plus the trusted manifest at
   `assets/content-packs/manifest.json`.
2. In the public `EMWORLDLTD/Ginomai` GitHub repository, create a separate content
   release (for example `content-v1`) and upload the generated `.gz` files and
   manifest. Keep this separate from app versions: the desktop updater must keep
   selecting application releases. Upload as a prerelease rather than marking it
   the latest app release. Never upload repository credentials.
3. Set the public HTTPS asset base URL when regenerating the packs:

```powershell
$env:GINOMAI_CONTENT_BASE_URL = 'https://github.com/EMWORLDLTD/Ginomai/releases/download/content-v1'
npm run build:content-packs
```

The generated hash-based asset filenames are immutable: changing data changes the
filename. Upload every newly generated file before distributing a new installer.
Users need no GitHub account or cloud storage credentials for public downloads.

## Build the smaller installer

```powershell
npm run dist:win -- --cloud-content
```

This command requires the configured HTTPS source and verifies every optional
remote file against its compressed checksum before packaging. If hosting is absent,
incomplete, or different from the local datasets, the build stops before excluding
content. Ordinary `npm run dist:win` continues to produce the fully bundled app.

For macOS, add `--cloud-content` to the existing Mac build command on a Mac.
This phase leaves AI assets and runtime dependencies bundled. Moving AI into its
own download requires a separate worker/dependency loading change and validation.
Previously built installers are not modified by these source changes.

## Verification

`node --test tests/content-packs.test.js tests/installer.test.js`

Before distribution, test first-use download, cancellation, interrupted download,
offline relaunch, Strong’s lookups, removal/re-download, and desktop update on the
actual target platform. The content release must be publicly accessible.
