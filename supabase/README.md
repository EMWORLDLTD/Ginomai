# Ginomai accounts and cloud backups

## Implementation and release status

1. Shared format and adapters: implemented; additive restore keeps the active service and live output.
2. Optional email-code accounts: implemented on desktop and web; authentication storage is separate from content.
3. Private snapshots: implemented; SQL enforces ownership, a 20 MiB limit, and atomic retention of five successful backups.
4. Activity and private reports: implemented; basic usage statistics default to on, preserve saved opt-outs, and administrators are assigned server-side.
5. Integration: automated PostgreSQL, model, authentication, browser, web-build and packaging checks are provided. Production delivery still requires the setup below.

The supplied project URL and public publishable key are in `js/cloud-config.js`. The user has run both migrations and saved custom SMTP and code templates. A read-only check confirmed the backup endpoint exists and denies anonymous access. `enabled` remains `false` until actual code delivery is verified. `localTesting: true` permits a personal account test only on HTTP(S) localhost, 127.0.0.1, or IPv6 loopback; hosted and LAN URLs remain gated. A public key cannot install migrations or configure SMTP. No privileged credential belongs in the app or this repository.

## Supabase setup

Open the project's SQL editor and run these files in order, once:

1. `migrations/202610120001_cloud_backups.sql`
2. `migrations/202610120002_cloud_activity.sql`

Each migration is transactional. Existing application content is unaffected. If using the Supabase CLI, link the intended project and use its normal migration deployment workflow instead. Reload the PostgREST schema cache if functions are not immediately discoverable: `notify pgrst, 'reload schema';`.

Enable email authentication and new-user signup, and keep **Confirm email** enabled. Configure a production SMTP provider and sender in the dashboard; enter SMTP secrets only there. Update both **Confirm signup** and **Magic Link** email templates to contain the code variable. New accounts use signup confirmation; returning users use the magic-link flow. [Supabase authentication implementation](https://github.com/supabase/auth/blob/master/internal/api/magic_link.go)

```html
<h2>Your Ginomai sign-in code</h2>
<p>Enter this code in Ginomai: {{ .Token }}</p>
<p>If you did not request this code, ignore this email.</p>
```

Configure email OTPs of 6–10 digits, a 10-minute expiration, and at least 60 seconds between sends. Ginomai accepts the full code as text, preserving leading zeros. The app verifies codes directly; no browser redirect or desktop callback URL is needed. Test delivery to a mailbox outside your Supabase organization before release. Supabase's default sender is not a production replacement for custom SMTP. See [email OTP documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless) and [SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp).

After the intended administrator signs up and verifies their email, find their account UUID in Supabase Authentication. Assign access in the SQL editor:

```sql
insert into ginomai_private.administrators(user_id)
values ('REPLACE_WITH_VERIFIED_ACCOUNT_UUID') on conflict do nothing;
```

The admin page is a separate browser page at `/js/cloud-admin.html`; there is no admin-report link or section in the desktop or web Account panel. For local testing, open `http://localhost:8500/js/cloud-admin.html`. For a hosted web build, use its site URL followed by `/js/cloud-admin.html`. The public page shell contains no report data. Its RPC checks the private administrator table before returning counts. An ordinary account cannot assign itself administrator access or read analytics tables.

## Enable and validate production

Set `enabled: true` and `localTesting: false` in `js/cloud-config.js` only after migrations and SMTP/code delivery are verified. Build web with `npm run build:web` and ship the normal desktop build. Both versions use the same configuration and backend. Public URL/key configuration is safe to ship; a Supabase secret/service-role key is explicitly rejected by the client.

Verify with two separate accounts:

- New-user and returning email codes, wrong/expired codes, resend limits, restart persistence and sign-out.
- Account A's backup never appears for B; B cannot download or delete A's backup even with its UUID.
- Six successful saves retain five; a failed/oversized save does not prune earlier snapshots.
- Desktop-to-web and web-to-desktop restore preserves local edits and keeps the selected service, live slide, and connected output unchanged.
- Media becomes a labeled placeholder; missing translations generate installation notices. Desktop scripture ranges preserve their reference but open the chapter. Medleys are preserved through web backups for desktop reuse.
- Guests operate normally; basic usage statistics default to on when no preference is saved. A saved off preference stays off. Privacy preferences provides the switch and an info icon with collection details. Disabling it cancels pending client sends and stops future collection. Unconfigured clients send no activity requests. Already accepted historical counts are retained.
- The assigned administrator can refresh the report; an ordinary account receives a permission denial.

## Interfaces and storage

`cloud_backup` format version 1 allowlists platform/date, song identity/title/author/lyrics/stanza labels, and session identity/name/notes/agendas/medley selections. It excludes device paths, binary files, translation text, credentials, preferences and current projection. Restored sessions and new songs receive safe generated IDs, references are remapped, and identical songs are reused. Existing `.sflow` and `.ginomai`/`.ginomia` file workflows retain their behavior.

Desktop songs remain in `ScriptureFlowStore` IndexedDB and sessions in localStorage. A journal records previous local values and IDs of newly staged songs before a restore. Startup rolls back incomplete writes before loading the library. A failed recovery rejects cloud restore readiness rather than silently discarding the journal. Web restore commits the entire workspace in one IndexedDB transaction. Neither adapter selects restored content or publishes projection state.

Public RPCs:

| Function | Access | Purpose |
| --- | --- | --- |
| `cloud_backup_save(p_payload jsonb)` | Verified authenticated account | Insert and retain five snapshots in one transaction |
| `cloud_backup_list()` | Authenticated owner | Read metadata without transferring payloads |
| `cloud_backup_get(p_id uuid)` | Authenticated owner | Download one snapshot |
| `cloud_backup_delete(p_id uuid)` | Authenticated owner | Delete one snapshot |
| `record_cloud_activity(p_installation_id uuid, p_platform text, p_app_version text, p_consent boolean)` | Guest or authenticated | Record server-dated daily activity while statistics are enabled; derive account identity from authentication. The legacy `p_consent` parameter reflects the enabled preference, not proof of explicit opt-in. |
| `cloud_admin_report()` | Assigned administrator | Aggregate verified accounts and daily/30-day activity |

Backup reads have row-level ownership policies. Only the verified save function can insert; direct client inserts/updates are denied. Privileged functions fix their search path and check authenticated ownership explicitly. Private metrics and administrator tables grant clients no direct access. SQL size enforcement uses PostgreSQL's JSON serialization, so snapshots extremely close to the 20 MiB client boundary can be rejected safely without pruning earlier backups.

Installation IDs identify storage profiles, not people. Reinstalling or clearing browser storage can create another identity. Guest activity is a public, unverified estimate and can be fabricated; never present it as verified membership. No account/install count is combined into an estimated total population. Verified account totals include accounts that disabled statistics; activity totals cover users with statistics enabled only. Daily means the server's UTC calendar day; monthly means today and the preceding 29 UTC days. App activity is recorded at controller startup and while visible, at most once daily per account/install from each client.

Account and consent storage are independent of backup content. Device-wide factory reset still clears all local account/consent storage under the existing reset workflow. Signing out preserves songs and sessions; offline sign-out cannot confirm server refresh-token revocation, and the UI reports that limitation. Web authentication tokens use origin storage; serve the web release over HTTPS and keep script injection protections intact.

## Checks and rollback

```powershell
node --test tests/cloud-backup.test.js tests/cloud-client.test.js tests/cloud-backups-service.test.js tests/cloud-analytics.test.js tests/cloud-database.test.js web/tests/web.test.cjs
# Uses the same Playwright setup as the existing browser checks:
node tests/cloud-account.browser.cjs
```

PostgreSQL checks use the development-only PGlite dependency; it does not enter the desktop production package. The browser harness uses mocked Supabase responses and isolated temporary local stores. It does not send OTP emails or change real cloud data. Set `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` when using a bundled Playwright runtime/system Chrome, and optionally `CLOUD_ARTIFACTS` for screenshots.

For a rollout rollback, set `enabled: false`, rebuild and redeploy. Local operation remains usable and cloud data stays intact. To revoke an administrator, delete their row from `ginomai_private.administrators` in the trusted SQL editor. Do not drop cloud tables as a routine rollback. Watch Supabase auth delivery failures, RPC errors, and database storage usage after enabling the release; inspect aggregate reports without collecting workspace content.
