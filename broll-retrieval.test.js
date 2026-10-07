'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const retrieval = require('./vector-retrieval-client');

function words(list) {
  // [text, start, end]
  return list.map(([text, start, end]) => ({ text, start, end }));
}

test('search windows follow spoken phrases instead of fixed 7-second steps', () => {
  const queries = retrieval.queriesFromWords(words([
    ['सुबह', 0.0, 0.4], ['गुनगुना', 0.5, 1.0], ['पानी', 1.1, 1.5], ['पिएं।', 1.6, 2.1],
    ['इससे', 2.3, 2.7], ['पाचन', 2.8, 3.2], ['ठीक', 3.3, 3.6], ['रहता', 3.7, 4.0], ['है', 4.1, 4.3],
    ['और', 5.0, 5.2], ['गैस', 5.3, 5.6], ['नहीं', 5.7, 6.0], ['बनती।', 6.1, 6.6],
  ]), 10);
  assert.deepEqual(queries.map(q => q.text), ['सुबह गुनगुना पानी पिएं।', 'इससे पाचन ठीक रहता है', 'और गैस नहीं बनती।']);
  assert.deepEqual(queries.map(q => [q.at, q.end]), [[0, 2.1], [2.3, 4.3], [5, 6.6]]);
});

test('a short trailing fragment joins the previous phrase and long speech is split', () => {
  const long = [];
  for (let i = 0; i < 20; i++) long.push([`w${i}`, i * 0.5, i * 0.5 + 0.4]);
  long.push(['end.', 10.2, 10.5]);
  const queries = retrieval.queriesFromWords(words(long), 12);
  assert.ok(queries.every(q => q.end - q.at <= 7.01), 'no phrase longer than 7 seconds');
  assert.ok(queries[queries.length - 1].text.endsWith('end.'));
  assert.ok(queries[queries.length - 1].end - queries[queries.length - 1].at >= 1, 'no tiny trailing query');
});

test('shortlist keeps locally imported clip IDs and drops weak matches', async () => {
  const previousFetch = global.fetch;
  const previousFloor = process.env.BROLL_MIN_MATCH_SCORE;
  delete process.env.BROLL_MIN_MATCH_SCORE;
  global.fetch = async () => ({ ok: true, json: async () => ({ results: [
    { at: 0, candidates: [{ id: 'B036', title: 'heron catching fish', rank_score: 0.33, in_point_seconds: 2 },
      { id: 'U0001', title: 'owned clip', rank_score: 0.25, in_point_seconds: 0 },
      { id: 'B003', title: 'eye close up', rank_score: 0.12, in_point_seconds: 1 }] },
    { at: 4, candidates: [{ id: 'B030', title: 'x-ray', rank_score: 0.15, in_point_seconds: 0 }] },
  ] }) });
  try {
    const result = await retrieval.shortlistQueries([{ at: 0, end: 3, text: 'bird fishing' }, { at: 4, end: 6, text: 'glucometer' }], 'http://localhost:1/search');
    assert.deepEqual([...result.ids].sort(), ['B036', 'U0001']);
    assert.equal(result.weak_windows, 1);
    assert.match(result.hints, /^0-3s: B036 heron catching fish/m);
    assert.match(result.hints, /4-6s: NO GOOD VIDEO MATCH/);
    assert.equal(result.source, 'vector');
  } finally {
    global.fetch = previousFetch;
    if (previousFloor !== undefined) process.env.BROLL_MIN_MATCH_SCORE = previousFloor;
  }
});

test('keyword fallback finds approved clips by name when vector search is down', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heygen-keyword-'));
  const previous = process.env.PROJECT_ASSETS_DIR;
  try {
    const stockDir = path.join(root, 'broll-assets');
    fs.mkdirSync(stockDir);
    fs.writeFileSync(path.join(stockDir, 'asset-map.json'), JSON.stringify({ assets: {} }));
    fs.writeFileSync(path.join(stockDir, 'local-asset-map.json'), JSON.stringify({ assets: {
      U0001: 'woman-drinking-warm-water-in-kitchen-2026-09-17-10-00-00-utc.mp4',
      U0002: 'carrots-growing-in-garden.mp4',
      U0003: 'unapproved-water-glass.mp4',
    } }));
    fs.writeFileSync(path.join(root, 'local-approved-stock-ids.json'), JSON.stringify(['U0001', 'U0002']));
    for (const name of ['woman-drinking-warm-water-in-kitchen-2026-09-17-10-00-00-utc.mp4', 'carrots-growing-in-garden.mp4', 'unapproved-water-glass.mp4']) {
      fs.writeFileSync(path.join(stockDir, name), 'fixture');
    }
    process.env.PROJECT_ASSETS_DIR = root;
    delete require.cache[require.resolve('./local-media-catalog')];
    const catalog = require('./local-media-catalog');
    const [water, sugar] = catalog.keywordShortlist([
      { at: 1, end: 3, text: 'a woman drinks a glass of warm water' },
      { at: 5, end: 8, text: 'checking blood sugar with a glucometer' },
    ]);
    assert.deepEqual(water.candidates.map(c => c.id), ['U0001']);
    assert.equal(sugar.candidates.length, 0);
    const formatted = retrieval.formatShortlist([water, sugar], 'keyword');
    assert.equal(formatted.weak_windows, 1);
  } finally {
    if (previous === undefined) delete process.env.PROJECT_ASSETS_DIR;
    else process.env.PROJECT_ASSETS_DIR = previous;
    delete require.cache[require.resolve('./local-media-catalog')];
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function transcriptFixture() {
  const list = [];
  const spoken = ['पहला', 'वाक्य', 'है', 'दूसरा', 'वाक्य', 'है', 'तीसरा', 'वाक्य', 'है', 'चौथा', 'वाक्य', 'है'];
  spoken.forEach((text, i) => list.push({ text, start: i * 1.5, end: i * 1.5 + 1.2, type: 'word' }));
  return { words: list };
}
function still(id, anchor, start) {
  return { id, anchor_text: anchor, start_hint_seconds: start, media_type: 'generated_image', prompt: `distinct still ${id}`, asset_id: null, in_point_seconds: null };
}

test('a plan may use at most two generated stills', () => {
  const { validatePlan } = require('./video-broll-factory');
  const transcript = transcriptFixture();
  const previous = process.env.BROLL_MAX_GENERATED_STILLS;
  delete process.env.BROLL_MAX_GENERATED_STILLS;
  try {
    assert.throws(() => validatePlan({ images: [still(1, 'पहला', 0), still(2, 'दूसरा', 4.5), still(3, 'तीसरा', 9)] }, transcript, 18),
      /3 generated stills; at most 2/);
    const plan = validatePlan({ images: [still(1, 'पहला', 0), still(2, 'दूसरा', 4.5)] }, transcript, 18);
    assert.deepEqual(
      { v: plan.coverage.video_shots, r: plan.coverage.real_photo_shots, g: plan.coverage.generated_still_shots, s: plan.coverage.video_share_of_broll },
      { v: 0, r: 0, g: 2, s: 0 });
    process.env.BROLL_MAX_GENERATED_STILLS = '0';
    assert.throws(() => validatePlan({ images: [still(1, 'पहला', 0)] }, transcript, 18), /at most 0 are allowed/);
  } finally {
    if (previous === undefined) delete process.env.BROLL_MAX_GENERATED_STILLS;
    else process.env.BROLL_MAX_GENERATED_STILLS = previous;
  }
});

test('review list numbers shots and labels generated stills clearly', () => {
  const { reviewMarkdown, thumbnailTime } = require('./broll-review-sheet');
  const md = reviewMarkdown([
    { type: 'video', asset_id: 'B036', path: 'x.mp4', start: 1, duration: 3, spoken_context: 'मछली | पकड़ना', match_reason: 'bird fishing' },
    { type: 'image', category: 'product', product_id: 79, path: 'p.jpg', start: 6.5, duration: 2.5 },
    { type: 'image', category: 'generated', path: 'g.png', start: 11, duration: 3, prompt: 'warm water' },
  ], { coverage: { video_shots: 1, real_photo_shots: 1, generated_still_shots: 1, video_share_of_broll: 0.3333 }, retrieval: { source: 'keyword', no_match_phrases: 2, warning: 'vector search unavailable; keyword fallback used' } });
  assert.match(md, /videos: 1 \| real photos: 1 \| generated stills: 1 \| video share: 33%/);
  assert.match(md, /WARNING: vector search unavailable/);
  assert.match(md, /\| 1 \| 0:01.0-0:04.0 \| video B036 \| मछली \/ पकड़ना \| bird fishing \|/);
  assert.match(md, /\| 3 \| 0:11.0-0:14.0 \| GENERATED STILL \| {2}\| warm water \|/);
  // Mid-shot thumbnail, clamped like the renderer's seek.
  assert.equal(thumbnailTime({ in_point_seconds: 2, duration: 3 }, 20), 3.5);
  assert.equal(thumbnailTime({ in_point_seconds: 19, duration: 3 }, 10), 8.4);
});

const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0;
test('contact sheet renders one tile per shot', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  const { buildReviewSheet } = require('./broll-review-sheet');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heygen-sheet-'));
  try {
    const clip = path.join(dir, 'clip.mp4'), photo = path.join(dir, 'photo.png');
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=6', '-pix_fmt', 'yuv420p', clip]);
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=400x400', '-frames:v', '1', photo]);
    const placements = [
      { type: 'video', asset_id: 'B001', path: clip, start: 0, duration: 3, in_point_seconds: 1 },
      { type: 'image', category: 'generated', path: photo, start: 5, duration: 3 },
      { type: 'video', asset_id: 'B002', path: clip, start: 10, duration: 3, in_point_seconds: 0 },
      { type: 'image', category: 'product', product_id: 1, path: photo, start: 15, duration: 3 },
      { type: 'video', asset_id: 'B003', path: clip, start: 20, duration: 3 },
    ];
    const result = buildReviewSheet(placements, { coverage: {}, retrieval: {} }, dir);
    assert.ok(fs.statSync(result.sheet).size > 1000);
    assert.equal(result.rows, 2);
    assert.equal(result.columns, 4);
    assert.ok(fs.readFileSync(result.markdown, 'utf8').includes('| 5 |'));
    assert.equal(fs.existsSync(path.join(dir, 'review-thumbs')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
