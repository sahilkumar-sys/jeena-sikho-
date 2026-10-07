# Separate Meta publishing workflow

This workflow reads only completed videos in `../processed`. It does not call the B-roll factory or change rendered videos. It uses the existing Gemini key to draft a title and description from `transcript.json`, then writes one editable review file per video in `queue/`. No Meta call is made until that file is manually approved.

`posting-ledger.csv` is a UTF-8 spreadsheet snapshot of every completed video found in `processed/`. It tracks the video path, LLM-generated title and description, manual approval, scheduled time, and Instagram/Facebook posting status and IDs. New renders appear as `draft_needed`; the title and description fill after draft preparation. The JSON review files remain authoritative: edit and approve `queue/<job-id>.json`, not the CSV. The ledger is refreshed after draft creation and each saved posting state. Run `node /files/heygen-workflow/publishing/meta-publisher.js --sync-csv` to rebuild it without any API calls.

## Setup

1. Add `META_PAGE_ID`, `META_IG_USER_ID`, and `META_PAGE_ACCESS_TOKEN` to the Docker Compose `.env` at `C:\Users\js19187\Documents\Codex\2026-09-22\i-x20-2\outputs\n8n-docker\.env`. `META_GRAPH_VERSION` defaults to `v26.0`. Use a Facebook Page access token with publishing permissions for that Page and its linked Instagram professional account. The existing `GEMINI_API_KEY`, `LLM_API_URL`, and `LLM_MODEL` generate the drafts. Set `PUBLISHING_LLM_MODEL` only if title/description generation should use a different model, such as a cheaper Flash Lite model; test output quality first.
2. Recreate the n8n service so it receives the new variables: `docker compose up -d --no-build --force-recreate n8n` from the Compose directory.
3. `meta-publishing-workflow.json` has been imported into this n8n instance as a **separate**, inactive workflow. Its manual trigger prepares at most one new draft and checks approved posts. Activate its five-minute schedule when you want the queue checked automatically.
4. Open `queue/<job-id>.json` in Notepad. Review or edit `title` and `description`, and check `facebook_destination`. Set `approval` from `pending` to `approved` only when ready to post to **both** destinations. Leave `publish_at` as `null` for the next queue run, or enter an ISO time with timezone, such as `2026-09-25T18:00:00+05:30`.
5. Run the workflow manually, or allow the five-minute schedule to find approved, due posts. Each platform's status and post ID are saved in the same review file. Facebook stays `processing` until a status check confirms publishing has completed. If a publish result is uncertain, the status becomes `needs_review`; the workflow will not automatically issue a duplicate publish request.

The user authorized LLM drafting of titles/descriptions on 26 September 2026. This does not authorize posting any particular video; each JSON draft still needs its own approval. Meta credentials and a live Graph API posting test are still outstanding.

The current router uses Instagram Reels for every eligible vertical video. Facebook uses a Page Reel for videos from 4 to 60 seconds and a Page video post for longer videos, preserving the full 90-second factory output. The Facebook destination is fixed when the draft is created; do not change it manually. This policy follows Meta's published sample requirements for Facebook Reels. Posting times can be chosen per video through `publish_at`; no time is imposed by the factory.

The script also supports direct Docker commands: `node /files/heygen-workflow/publishing/meta-publisher.js --check`, `--prepare`, `--publish`, or `--run`. `--check` makes no API calls. `--prepare` uses Gemini but never calls Meta. `--publish` only processes approved, due drafts. `--run` does both. The workflow uses `--run --max-new 1 --report-json`.

The queue uses `.publisher.lockdir` to prevent overlapping runs. If the container stops unexpectedly while publishing, inspect the review files and Meta accounts before removing this directory and resuming. A `needs_review` platform status also requires checking the Meta account before any manual retry.

Meta references: [Instagram Reels sample and resumable upload](https://github.com/fbsamples/reels_publishing_apis/blob/main/insta_reels_publishing_api_sample/README.md), [Facebook Reels sample and 60-second limit](https://github.com/fbsamples/reels_publishing_apis/blob/main/fb_reels_publishing_api_sample/README.md), [Meta Graph API v26.0](https://developers.meta.com/blog/).
