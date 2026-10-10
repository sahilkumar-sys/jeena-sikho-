# Envato one-click links and download collector — Claude, 2026-10-10

Branch/PR: `claude/envato-links` (on top of `claude/context-refresh`), PR pending

## Request
For Quality mode, give a list of needed Envato elements with links; ideally download automatically with the user's Envato login. User has an Envato Elements subscription. Wanted: one file from n8n that opens all links in the browser with one click; the human downloads because Envato needs login.

## Findings (research)
- Envato Elements has no public download API (its API is affiliate-only search/metadata); the Market API (VideoHive) downloads only purchased items. Elements' Fair Use Policy forbids scripts/bots for mass downloading (risk: account suspension). Agents must not enter passwords. So no automated login/download; the user downloads in their own browser.
- Elements search links: `https://elements.envato.com/stock-video/<slug>` and `/orientation-vertical` (verified against the live results page, which links those filter URLs).

## Done
- `envato-links.js`: slug + search URLs per missing moment (keyword term first), `envato-links.html`, `Open-Envato-Links.cmd` (only URLs matching a strict safe pattern; optional `BROWSER=`; starts the collector via a path relative to the inbox), `envato-moments.json`.
- `broll-mode.js`/factory: links in `envato-needed.md`, links page in the job folder, helpers in the inbox when Quality stops; result has `envato_opener`, `envato_links_page`, per-moment `link`; tracker note mentions the one-click file.
- `Collect-Envato-Downloads.ps1`: watches the Downloads folder, waits until a download is complete (size stable, not locked; ignores `.crdownload`), moves it into the inbox as `<n>-<slug>--<original>`, unzips zips, logs to `collector-log.txt`, never downloads.
- n8n summary: "ONE CLICK" line and an Envato link per moment; `report.envato_links`.
- Rollback: `versions/pre-envato-links-2026-10-10/`.

## Verified
- 51/51 Node tests (5 new link tests; Quality and n8n tests extended). `Collect-Envato-Downloads.Test.ps1` passes in Windows PowerShell 5.1; watch mode tested with a simulated growing `.crdownload` renamed to `.mp4` (collected and labelled). Generated `.cmd` dry-run in `cmd.exe` (start replaced by echo): correct URLs and collector path with spaces.

## Not verified / limits
- Real browser tab opening and a real Envato download (needs the user's login). Match labelling depends on Envato's descriptive file names; unmatched files keep their Envato name and still import. PowerShell 7 run of the collector test happens in CI only (no pwsh locally).

## Open questions / next step
- User to try one real Quality stop: double-click the opener, download, run again. Then resume quick wins 1–5.
