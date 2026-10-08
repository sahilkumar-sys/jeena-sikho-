# B-roll finding flow review — Claude, 2026-10-07

Branch/PR: `claude/session-log-rule` (docs only), no code changed

## Request
User asked for a review of the current B-roll finding flow and suggested improvements.

## Current flow (live v7.1 code, read from source)
1. `vector-retrieval-client.js` `queriesFromWords`: fixed windows every 7 s (6 s span, first 18 words).
2. `englishVisualQueries` (planner LLM) translates windows to English; `vector-retrieval-service.py` scores approved indexed clips: `0.7*best frame + 0.1*title + 0.2*lexical`, always returns top 5, in-point = best frame − 1.2 s.
3. `planBroll`: sends the full approved catalog (filename slugs only) when ≤40 entries, else the shortlist; LLM picks `stock_video | product | social | hospital | generated_image`, max one shot per 3.6 s.
4. `validatePlan` checks approval, anchors, uniqueness, spacing; `speech-duration-planner.js` fits 2.1–4.2 s lengths to phrase endings.
5. Anything not local → generated still. `broll-usage-ledger.js` records stock IDs per render.

Inventory: 21 approved of 59 mapped project clips; indexed frames at 10/35/60/85% only.

## Findings (most impactful first)
1. Sourcing chain stops at 21 approved clips → generated still. Extended/E:/Envato and existing-still search are absent (known gap).
2. If catalog grows past 40 and the vector service is down, the planner is told there is no video at all → whole reel becomes generated stills silently. Needs lexical/FTS fallback and a loud warning.
3. LLM judges video fit from filename slugs only; nothing checks the actual frames of the chosen in-point window against the spoken beat.
4. Retrieval windows are time-based, not phrase-based; beats between windows get no candidates, and 18-word cap truncates.
5. No score floor: weak top-5 always offered as candidates; "no approved match" is effectively never returned.
6. Only 4 frames per project clip → coarse in-points; the shot window may miss the matched action.
7. No video/image ratio measurement in plan or manifest, so the 70/30 target cannot be tracked.
8. No search over existing stills (16 prior stills, product/reference photos by content) before generation.
9. Approvals are a bare ID list: no source, licence, reviewer, date, people/cultural check notes. Needed before Extended/Envato clips can be approved.
10. Stale provider defaults in `plannerSettings` (`gpt-4o-mini`, `claude-3-5-sonnet-latest`, Gemini paths) — should be explicit env, no Gemini.

## Verified
- Source reading only. No tests, provider calls, vector service, or renders run.

## Open questions / next step
- User to pick which improvements to implement first (see chat reply / roadmap).
