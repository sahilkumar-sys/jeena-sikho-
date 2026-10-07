# Supplied-video factory

The agreed code fixes are implemented. Read `FACTORY-FIXES.md` for changes, verification and setup. `FACTORY-REVIEW-AND-SETUP.md` is the historical audit, with original Docker setup instructions.

Import the updated `video-broll-factory-workflow.json` into Docker n8n, supply provider credentials in its environment, and validate one video manually before activating the schedule.

Completed inputs go in `incoming`; selection/status are in `video-control.csv`; outputs and retry checkpoints go in `processed`. Retries reuse valid matching transcripts, plans and images.

Keep the new `factory-state.js` helper with the runner. The shared `assemble-test-video.js`, subtitle converter/style, Khand font and approved whoosh remain essential. Green-screen settings and the renderer are unchanged.

Linux kernel locks protect the batch. Their files remain on disk while idle; do not delete them. Edit CSV only when no execution is running. Older workflows, test assets and version backups are in `Non-Essential Testing Items`.
