'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fitCheckPlan, phraseFor } = require('./broll-fit-check');

const queries = [
  { at: 0, end: 3, text: 'a woman drinking warm water in the kitchen' },
  { at: 4, end: 8, text: 'a bird catching fish in a river' },
  { at: 9, end: 12, text: 'a man holding his painful knee' },
  { at: 13, end: 16, text: 'carrots growing in a garden' },
];
function shot(id, asset, start, inPoint = 0) {
  return { id, media_type: 'stock_video', asset_id: asset, start_seconds: start, in_point_seconds: inPoint, duration_seconds: 3, match_reason: 'planner reason' };
}
// A fake /verify that returns canned scores per asset, like the Python service.
function fakeVerify(table) {
  const calls = [];
  const verify = async (shots, used) => {
    calls.push({ shots, used: [...used] });
    return shots.map(s => ({ id: s.id, asset_id: s.asset_id, ...table[s.asset_id] }));
  };
  return { verify, calls };
}

test('the phrase checked is the one spoken when the shot starts', () => {
  assert.equal(phraseFor({ start_seconds: 5.2 }, queries), 'a bird catching fish in a river');
  assert.equal(phraseFor({ start_seconds: 3.2 }, queries), 'a woman drinking warm water in the kitchen');
});

test('a shot starting on a phrase boundary is checked against the new phrase, not the previous one', () => {
  // Real case (diabetes sample): junk food 20-23.4 s, Ayurveda from 23.5 s; herbal clip placed at 23.48 s.
  const touching = [{ at: 20, end: 23.4, text: 'a person eating junk food' }, { at: 23.5, end: 25.8, text: 'ayurvedic herbs' }];
  assert.equal(phraseFor({ start_seconds: 23.48 }, touching), 'ayurvedic herbs');
  assert.equal(phraseFor({ start_seconds: 23.3 }, touching), 'a person eating junk food');
});

test('fit check keeps good shots, moves, swaps, drops and flags weak ones', async () => {
  const previous = { min: process.env.BROLL_MIN_MATCH_SCORE, drop: process.env.BROLL_DROP_BELOW_SCORE };
  delete process.env.BROLL_MIN_MATCH_SCORE; delete process.env.BROLL_DROP_BELOW_SCORE;
  const { verify, calls } = fakeVerify({
    // good where planned, and best window is only slightly better: keep
    B001: { indexed: true, current_score: 0.30, best_score: 0.31, best_in_point: 5, alternatives: [] },
    // planned seconds are weak but another part of the same clip fits: move
    B002: { indexed: true, current_score: 0.15, best_score: 0.29, best_in_point: 11, alternatives: [] },
    // wrong clip; best alternative B001 is already used, B009 fits: swap to B009
    B003: { indexed: true, current_score: 0.11, best_score: 0.12, best_in_point: 0,
      alternatives: [{ id: 'B001', score: 0.40, in_point_seconds: 1 }, { id: 'B009', score: 0.26, in_point_seconds: 4 }] },
    // clearly wrong, nothing better: drop (presenter stays on screen)
    B004: { indexed: true, current_score: 0.10, best_score: 0.12, best_in_point: 2, alternatives: [{ id: 'B010', score: 0.13, in_point_seconds: 0 }] },
  });
  const plan = { images: [
    shot(1, 'B001', 0.5), shot(2, 'B002', 4.5, 2), shot(3, 'B003', 9.2), shot(4, 'B004', 13.5),
    { id: 5, media_type: 'product', product_query: 'P79', start_seconds: 17 },
  ] };
  try {
    const { images, report } = await fitCheckPlan(plan, queries, verify);
    assert.deepEqual(calls[0].used.sort(), ['B001', 'B002', 'B003', 'B004']);
    assert.equal(calls[0].shots[1].text, 'a bird catching fish in a river');
    assert.deepEqual(images.map(i => i.id), [1, 2, 3, 5]);
    assert.equal(images[0].fit.action, 'kept');
    assert.equal(images[0].in_point_seconds, 0);
    assert.equal(images[1].fit.action, 'moved');
    assert.equal(images[1].in_point_seconds, 11);
    assert.equal(images[2].fit.action, 'swapped');
    assert.equal(images[2].asset_id, 'B009');
    assert.equal(images[2].in_point_seconds, 4);
    assert.match(images[2].match_reason, /swapped from B003/);
    assert.equal(images[3].media_type, 'product', 'real photos are not checked or changed');
    assert.deepEqual({ k: report.kept, m: report.moved, s: report.swapped, d: report.dropped, w: report.weak },
      { k: 1, m: 1, s: 1, d: 1, w: 0 });
    assert.equal(report.keep_score, 0.18);
    assert.equal(report.drop_below_score, 0.14);
  } finally {
    if (previous.min !== undefined) process.env.BROLL_MIN_MATCH_SCORE = previous.min;
    if (previous.drop !== undefined) process.env.BROLL_DROP_BELOW_SCORE = previous.drop;
  }
});

test('an okay-but-not-good shot is kept and flagged; the last shot is never dropped', async () => {
  const { verify } = fakeVerify({
    B005: { indexed: true, current_score: 0.15, best_score: 0.16, best_in_point: 3, alternatives: [] },
    B006: { indexed: true, current_score: 0.05, best_score: 0.06, best_in_point: 0, alternatives: [] },
  });
  const weak = await fitCheckPlan({ images: [shot(1, 'B005', 0.5), shot(2, 'B006', 4.5)] }, queries, verify);
  assert.equal(weak.images[0].fit.action, 'weak');
  assert.equal(weak.images[0].in_point_seconds, 3, 'weak shot uses the best part of its clip');
  assert.equal(weak.report.dropped, 1);
  const only = await fitCheckPlan({ images: [shot(2, 'B006', 4.5)] }, queries, verify);
  assert.equal(only.images.length, 1);
  assert.equal(only.images[0].fit.action, 'weak');
});

test('shots without an index entry are left unchanged and reported', async () => {
  const { verify } = fakeVerify({ B007: { indexed: false, alternatives: [] } });
  const { images, report } = await fitCheckPlan({ images: [shot(1, 'B007', 0.5, 2)] }, queries, verify);
  assert.equal(images[0].in_point_seconds, 2);
  assert.equal(report.not_indexed, 1);
});

test('plans without video shots skip the service call', async () => {
  let called = false;
  const result = await fitCheckPlan({ images: [{ id: 1, media_type: 'generated_image' }] }, queries, async () => { called = true; return []; });
  assert.equal(called, false);
  assert.equal(result.report.status, 'no_video_shots');
});
