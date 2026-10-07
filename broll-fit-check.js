// Phase 2 fit check: before rendering, compare the exact seconds each planned
// video shot will show with the spoken phrase at that moment, using the stored
// 1 fps SigLIP2 frame vectors. Keep, move within the clip, swap to a better
// approved clip, or drop a clearly wrong shot so the presenter stays on screen.
const { minMatchScore, phraseAt } = require('./vector-retrieval-client');

const MOVE_GAIN = 0.03; // move the in-point only for a clear improvement
const DEFAULT_DROP_BELOW = 0.14; // calibration: non-matches cluster around 0.12

function dropBelowScore() {
  const value = Number(process.env.BROLL_DROP_BELOW_SCORE);
  return process.env.BROLL_DROP_BELOW_SCORE && Number.isFinite(value) ? value : DEFAULT_DROP_BELOW;
}

// The English visual query whose spoken phrase contains the shot start.
function phraseFor(shot, queries) {
  const start = Number(shot.start_seconds ?? shot.start ?? shot.start_hint_seconds);
  const inside = phraseAt(queries, start);
  const nearest = inside || [...queries].sort((a, b) => Math.abs(a.at - start) - Math.abs(b.at - start))[0];
  return nearest?.text || String(shot.match_reason || '').slice(0, 300);
}

function decide(shot, result, used, keep, dropBelow, othersRemaining) {
  const fit = { action: 'kept', score_before: null, score_after: null, from_asset: null, from_in_point: null };
  if (!result?.indexed) return { ...fit, action: 'not_indexed' };
  const current = result.current_score;
  fit.score_before = current;
  fit.from_in_point = shot.in_point_seconds ?? 0;
  if (current >= keep || result.best_score >= keep) {
    if (result.best_score - current >= MOVE_GAIN || current < keep) {
      return { ...fit, action: 'moved', in_point_seconds: result.best_in_point, score_after: result.best_score };
    }
    return { ...fit, score_after: current };
  }
  const alternative = (result.alternatives || []).find(a => a.score >= keep && !used.has(a.id));
  if (alternative) {
    return { ...fit, action: 'swapped', from_asset: shot.asset_id, asset_id: alternative.id,
      in_point_seconds: alternative.in_point_seconds, score_after: alternative.score };
  }
  const best = Math.max(current, result.best_score);
  if (best < dropBelow && othersRemaining > 0) return { ...fit, action: 'dropped', score_after: null };
  // Okay-but-not-good: keep the best part of this clip and flag it for review.
  return result.best_score > current
    ? { ...fit, action: 'weak', in_point_seconds: result.best_in_point, score_after: result.best_score }
    : { ...fit, action: 'weak', score_after: current };
}

async function fitCheckPlan(plan, queries, verify) {
  const keep = minMatchScore(), dropBelow = dropBelowScore();
  const shots = plan.images.filter(item => item.media_type === 'stock_video');
  if (!shots.length) return { images: plan.images, report: { status: 'no_video_shots' } };
  const used = new Set(shots.map(s => s.asset_id));
  const results = await verify(shots.map(shot => ({
    id: shot.id, asset_id: shot.asset_id, text: phraseFor(shot, queries),
    in_point: shot.in_point_seconds ?? 0, duration: shot.duration_seconds ?? shot.duration ?? 3,
  })), used);
  const byId = new Map(results.map(r => [r.id, r]));
  let remaining = plan.images.length;
  const details = [];
  const images = [];
  for (const item of plan.images) {
    if (item.media_type !== 'stock_video') { images.push(item); continue; }
    const fit = decide(item, byId.get(item.id), used, keep, dropBelow, remaining - 1);
    fit.phrase = phraseFor(item, queries);
    // Timing stays with the detail so a dropped shot can still be listed as a missing beat.
    details.push({ id: item.id, planned_asset: item.asset_id, start_seconds: item.start_seconds ?? item.start,
      duration_seconds: item.duration_seconds ?? item.duration, anchor_text: item.anchor_text, ...fit });
    if (fit.action === 'dropped') { remaining -= 1; continue; }
    const updated = { ...item, fit };
    if (fit.in_point_seconds !== undefined) updated.in_point_seconds = fit.in_point_seconds;
    if (fit.action === 'swapped') {
      used.delete(item.asset_id); used.add(fit.asset_id);
      updated.asset_id = fit.asset_id;
      updated.match_reason = `${item.match_reason || ''} [fit check: swapped from ${item.asset_id}]`.trim();
    }
    images.push(updated);
  }
  const count = action => details.filter(d => d.action === action).length;
  return { images, report: { status: 'checked', keep_score: keep, drop_below_score: dropBelow,
    kept: count('kept'), moved: count('moved'), swapped: count('swapped'), dropped: count('dropped'),
    weak: count('weak'), not_indexed: count('not_indexed'), details } };
}

module.exports = { fitCheckPlan, phraseFor, decide, dropBelowScore, MOVE_GAIN, DEFAULT_DROP_BELOW };
