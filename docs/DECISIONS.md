# Decisions

## 2026-10-07 — Source control boundary

- `main` contains the initial reviewed source baseline. Changes use `<agent-name>/<task>` branches and PR review before merge.
- Keep code, asset catalogs, and handoff documents in Git. Exclude credentials, live tracker data, rendered/source media, and bundled runtime dependencies. Those local files remain in the portable project copy; Git alone cannot reproduce a render.
- Keep the existing Node `node:test` suite as the dependency-free PR gate. No package manager was added.
- Preserve the existing v7.1 production code and inactive n8n schedule. Collaboration setup does not change provider behavior or approve publishing.

## 2026-10-07 — Fresh-clone bootstrap

- Keep the complete-folder portable setup for existing installations. Add a separate Windows clone bootstrap using Docker for n8n and CPU SigLIP2 retrieval, so host Python, Node, model, and vector DB need not be copied from the original machine.
- Accept only user-supplied, rights-confirmed B-roll into ignored local approval files. Never treat indexing alone as approval. Preserve existing media and private `.env` on repeat runs.
- Keep setup separate from execution. The imported n8n schedule and automatic processing remain off; publishing still requires per-video approval.
- The new private environment selects OpenAI text and, after explicit authorization, OpenAI Images API for unattended stills. Codex's in-chat image tool is available to an agent-led sample but cannot run as a scheduled script. The old portable Gemini settings are not modified.

## 2026-10-07 — B-roll goal and modes (user decisions)

- Goal is 100% video B-roll. Generated/generic stills are for dire cases only, at most 2 per reel. Exact real photos (named-product packs, YouTube/Facebook profile, HIIMS hospital) do not count toward that limit. If nothing fits, the presenter stays on screen rather than a weak visual.
- The user chooses **Quality** or **Quantity** per run in n8n. Quality stops before rendering when beats lack a good video and lists the Envato clips needed; Quantity always renders with the best approved fallback and reports weak spots. (Planned Step 3/5; not built yet.)
- A clip the user drops into a job's B-roll inbox counts as approval (licence and people check confirmed by the user). The factory records source, date, job and file fingerprint when it imports it. (Planned Step 4; not built yet.)
- Vector re-checking runs locally on the SigLIP2 model (GPU when available): no API credits. E: is read only; clips are copied to a local staging folder in chunks of up to 20 GiB before indexing. The `All panchkarma therepy` folder stays excluded from ordinary E: runs; on 7 October the user asked for it to be indexed separately into `runtime/vector-cache/index/panchkarma-1fps.sqlite` (root = that folder). Indexing it is not approval.

## 2026-10-07 — Quality mode "missing beat" rule (user decisions)

- Only **important** moments count: the planner lists moments where a real video would clearly help (symptom, body part, food, remedy, action, object) but no approved video fits. Greetings, filler and calls to action never stop a video. A planned video shot that the fit check dropped or flagged weak also counts.
- Quality mode does **not** accept generated stills: a moment that would need one goes on the Envato list instead. To render such a video anyway, run it in Quantity mode (which still allows up to 2 stills).
- The plan itself is the same in both modes; the mode only decides whether to stop. Switching a waiting job to Quantity therefore re-uses the saved plan (no new planner call).
