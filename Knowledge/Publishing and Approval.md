---
tags: [publishing, approval]
---

# Publishing and Approval

The Meta publisher is a separate workflow: **Meta Publisher - Review Queue (Instagram + Facebook)**. It reads completed renders, drafts titles and descriptions from transcripts, and creates `publishing/queue/<job-id>.json`. The queue JSON is authoritative; `publishing/posting-ledger.csv` is rebuilt from it. [[PROJECT#Separate Meta publisher|Source]]

## Approval path

1. Prepare or inspect a draft, then review its title, description, video, and destination.
2. Change that video's queue JSON `approval` from `pending` to `approved` only after explicit per-video approval.
3. Leave `publish_at=null` for the next queue run, or use an ISO timestamp with timezone.
4. A platform marked `needs_review` requires checking Meta and its queue file before retrying, to avoid duplicate posts.

The user authorized LLM drafting on 2026-09-26. That authorization does not approve a specific post. The publisher's schedule was inactive and Meta credentials/live posting test were outstanding at the handoff. [[PROJECT#Separate Meta publisher|Details]]

## Useful files and commands

- `publishing/README.md`: setup and complete command reference.
- `publishing/meta-publisher.js --check`: read-only, no API calls.
- `publishing/meta-publisher.js --sync-csv`: rebuild ledger without API calls.
- `--prepare` and `--run` call Gemini for drafts; `--publish` processes approved, due drafts.
- Instagram uses Reels. Facebook uses Page Reels for 4–60 seconds and Page video posts for longer videos.

See [[Files and Commands]] for paths. Keep publisher operation separate from [[Factory Operations]].
