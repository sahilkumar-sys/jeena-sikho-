'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const brollMode = require('./broll-mode');
const factory = require('./video-broll-factory');

// [text, start, end]
const WORDS = [
  ['नमस्ते', 0.0, 0.5], ['दोस्तों।', 0.6, 1.2],
  ['घुटनों', 2.0, 2.5], ['में', 2.6, 2.8], ['दर्द', 2.9, 3.3], ['रहता', 3.4, 3.8], ['है।', 3.9, 4.3],
  ['सुबह', 6.0, 6.4], ['गुनगुना', 6.5, 7.0], ['पानी', 7.1, 7.5], ['पिएं।', 7.6, 8.1],
  ['हल्दी', 10.0, 10.5], ['वाला', 10.6, 10.9], ['दूध', 11.0, 11.4], ['लें।', 11.5, 12.0],
  ['पैदल', 14.0, 14.5], ['चलें', 14.6, 15.0], ['रोज़।', 15.1, 15.6],
  ['धन्यवाद।', 18.0, 18.8],
].map(([text, start, end]) => ({ text, start, end, type: 'word' }));
const DURATION = 20;
const QUERIES = [
  { at: 0, end: 1.2, text: 'a presenter greeting friends' },
  { at: 2, end: 4.3, text: 'an elderly man with pain in his knees' },
  { at: 6, end: 8.1, text: 'drinking warm water in the morning' },
  { at: 10, end: 12, text: 'a glass of turmeric milk' },
  { at: 14, end: 15.6, text: 'people walking every day' },
  { at: 18, end: 18.8, text: 'presenter says thank you' },
];
const video = (id, asset, start, fit) => ({ id, media_type: 'stock_video', asset_id: asset, anchor_text: 'x', start_seconds: start, duration_seconds: 3, ...(fit ? { fit: { action: fit } } : {}) });

function samplePlan() {
  return {
    images: [
      video(1, 'B001', 6.0, 'kept'),
      { id: 2, media_type: 'generated_image', anchor_text: 'हल्दी वाला दूध', prompt: 'A glass of warm turmeric milk on an Indian kitchen table', start_seconds: 10.0, duration_seconds: 3 },
      video(3, 'B003', 14.0, 'weak'),
    ],
    fit_check: { status: 'checked', details: [
      { id: 0, planned_asset: 'B009', action: 'dropped', start_seconds: 2.0, duration_seconds: 3, phrase: 'an elderly man with pain in his knees' },
      { id: 1, planned_asset: 'B001', action: 'kept', start_seconds: 6.0, duration_seconds: 3, phrase: 'drinking warm water in the morning' },
      { id: 3, planned_asset: 'B003', action: 'weak', start_seconds: 14.0, duration_seconds: 3, phrase: 'people walking every day' },
    ] },
    // Planner: knee pain again (same moment as the dropped shot), warm water (already covered), and nothing else.
    missing_beats: [
      { anchor_text: 'घुटनों में दर्द', start_seconds: 2.0, visual_query: 'elderly Indian man holding his painful knee' },
      { anchor_text: 'गुनगुना पानी', start_seconds: 6.5, visual_query: 'woman drinking warm water' },
    ],
    retrieval: { queries: QUERIES },
    coverage: { video_shots: 2, generated_still_shots: 1 },
  };
}

function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  const restore = () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) { restore(); throw error; }
}

test('mode: default quantity, CLI wins over BROLL_MODE, typos are rejected', () => {
  assert.equal(brollMode.parseMode(undefined), 'quantity');
  assert.equal(brollMode.parseMode(' Quality '), 'quality');
  assert.equal(brollMode.resolveMode({}, {}), 'quantity');
  assert.equal(brollMode.resolveMode({}, { BROLL_MODE: 'quality' }), 'quality');
  assert.equal(brollMode.resolveMode({ 'broll-mode': 'quantity' }, { BROLL_MODE: 'quality' }), 'quantity');
  assert.throws(() => brollMode.parseMode('qualty'), /quality" or "quantity/);
  assert.throws(() => brollMode.resolveMode({ 'broll-mode': true }, {}), /received "true"/, 'a flag without a value is an error');
});

test('missing beats: dropped, weak and AI-picture moments plus uncovered planner beats, merged and in time order', () => {
  const beats = brollMode.missingBeats(samplePlan(), WORDS, DURATION);
  assert.deepEqual(beats.map(b => [b.start_seconds, b.source]), [[2, 'fit_check_dropped'], [10, 'generated_still'], [14, 'fit_check_weak']],
    'knee pain is listed once; warm water is covered by a kept shot; greetings never appear');
  assert.equal(beats[0].spoken, 'घुटनों में दर्द रहता है।');
  assert.equal(beats[0].english, 'an elderly man with pain in his knees');
  assert.ok(beats[0].search_terms.includes('indian elderly man pain knees'), beats[0].search_terms.join(' / '));
  assert.equal(beats[0].planned_asset, 'B009');
  assert.deepEqual(brollMode.searchTerms('person injecting insulin with a pen into the stomach').slice(0, 2), ['person injecting insulin with a pen', 'person injecting insulin pen']);
  assert.equal(beats[1].english, 'A glass of warm turmeric milk on an Indian kitchen table');
  assert.equal(beats[0].min_clip_seconds, 5);
  assert.match(beats[0].orientation, /Vertical 9:16/);
});

test('a plan with only good shots has no missing beats', () => {
  const plan = { images: [video(1, 'B001', 6, 'kept')], fit_check: { status: 'checked', details: [] }, missing_beats: [], retrieval: { queries: QUERIES } };
  assert.deepEqual(brollMode.missingBeats(plan, WORDS, DURATION), []);
});

test('validatePlan keeps valid planner missing beats, drops malformed ones, and is stable on re-validation', () => {
  const plan = {
    images: [{ id: 1, media_type: 'generated_image', anchor_text: 'गुनगुना पानी', start_hint_seconds: 6.5, prompt: 'warm water in a steel glass' }],
    missing_beats: [
      { anchor_text: 'हल्दी वाला दूध', start_hint_seconds: 10, visual_query: 'turmeric milk' },
      { anchor_text: 'not spoken', start_hint_seconds: 3, visual_query: '' },
      { anchor_text: 'पैदल चलें', start_hint_seconds: 1, visual_query: 'walking' }, // hint too far from the words
      'junk',
    ],
  };
  const once = factory.validatePlan(plan, { words: WORDS }, DURATION);
  assert.deepEqual(once.missing_beats, [{ anchor_text: 'हल्दी वाला दूध', start_seconds: 10, visual_query: 'turmeric milk' }]);
  const twice = factory.validatePlan(once, { words: WORDS }, DURATION);
  assert.deepEqual(twice.missing_beats, once.missing_beats);
});

function jobFixture(mode, plan) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broll-mode-'));
  const calls = [];
  const stages = [];
  const steps = {
    ensureFitCheck: async job => { calls.push('ensureFitCheck'); return job.plan; },
    generateBrollImages: async () => { calls.push('generateBrollImages'); return [{ type: 'video', start: 6, duration: 3 }]; },
    buildReviewSheet: () => { calls.push('buildReviewSheet'); return { sheet: 'sheet.jpg', markdown: 'review.md' }; },
    renderVideo: () => { calls.push('renderVideo'); return path.join(dir, 'assembly-manifest.json'); },
    fileHash: async () => 'source-hash',
    recordUsage: () => { calls.push('recordUsage'); },
  };
  const job = {
    mode, plan, planPath: path.join(dir, 'broll-plan.json'), jobId: 'video-abc123', videoPath: path.join(dir, 'reel one.mp4'), sourceHash: 'source-hash',
    workDir: dir, outputRoot: dir, outputPath: path.join(dir, 'reel-final.mp4'), transcript: { words: WORDS },
    transcriptPath: path.join(dir, 'transcript.json'), captionsPath: path.join(dir, 'captions.srt'), info: { duration: DURATION },
    renderSource: { video: 'src.mp4', info: { width: 1080, height: 1920 } }, cache: { plan: {} }, saveCache: () => {},
    transcriptionMeta: { audioMinutes: 0, estimatedCostUsd: 0, requestId: 'r1', reused: true }, controlRow: null, onStage: stage => stages.push(stage),
  };
  return { dir, job, steps, calls, stages };
}

test('Quality stops before AI pictures and rendering, writes the Envato list and the job inbox', async () => {
  const inboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'broll-inbox-'));
  await withEnv({ BROLL_INBOX_DIR: inboxRoot }, async () => {
    const { dir, job, steps, calls, stages } = jobFixture('quality', samplePlan());
    const result = await factory.finishJob(job, steps);
    assert.equal(result.status, 'needs_broll');
    assert.equal(result.output_video, null);
    assert.equal(result.missing_beats, 3);
    assert.deepEqual(calls, ['ensureFitCheck'], 'no image generation, review sheet or render in Quality mode');
    assert.deepEqual(stages, ['needs_broll']);
    const list = JSON.parse(fs.readFileSync(path.join(dir, 'envato-needed.json'), 'utf8'));
    assert.equal(list.required, true);
    assert.equal(list.beats.length, 3);
    const markdown = fs.readFileSync(path.join(dir, 'envato-needed.md'), 'utf8');
    assert.match(markdown, /this video was NOT rendered/);
    assert.match(markdown, /घुटनों में दर्द रहता है।/);
    assert.ok(fs.existsSync(path.join(inboxRoot, 'video-abc123', 'README.txt')));
    assert.equal(result.broll_inbox, path.join(inboxRoot, 'video-abc123'));
  });
});

test('Quantity always renders and marks the Envato list optional', async () => {
  const inboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'broll-inbox-'));
  await withEnv({ BROLL_INBOX_DIR: inboxRoot }, async () => {
    const { dir, job, steps, calls, stages } = jobFixture('quantity', samplePlan());
    const result = await factory.finishJob(job, steps);
    assert.equal(result.status, 'done');
    assert.deepEqual(calls, ['generateBrollImages', 'buildReviewSheet', 'renderVideo', 'recordUsage'], 'Quantity does not force a fit-check re-run');
    assert.deepEqual(stages, ['generating_images', 'rendering_ffmpeg']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'envato-needed.json'), 'utf8')).required, false);
    assert.match(fs.readFileSync(path.join(dir, 'envato-needed.md'), 'utf8'), /\*\*optional\*\*/);
    assert.equal(fs.readdirSync(inboxRoot).length, 0, 'no inbox is created in Quantity mode');
  });
});

test('Quality renders when every important moment has a good video, and removes an old list', async () => {
  const plan = { images: [video(1, 'B001', 6, 'kept')], fit_check: { status: 'checked', details: [] }, missing_beats: [], retrieval: { queries: QUERIES } };
  const { dir, job, steps, calls } = jobFixture('quality', plan);
  fs.writeFileSync(path.join(dir, 'envato-needed.md'), 'old');
  const result = await factory.finishJob(job, steps);
  assert.equal(result.status, 'done');
  assert.ok(calls.includes('renderVideo'));
  assert.equal(fs.existsSync(path.join(dir, 'envato-needed.md')), false);
});

test('Quality refuses to judge without a fit check (vector service down)', async () => {
  await withEnv({ BROLL_RETRIEVAL_URL: 'http://127.0.0.1:9/search' }, async () => {
    const plan = { ...samplePlan(), fit_check: { status: 'skipped', reason: 'vector search service unavailable' } };
    const { job, steps, calls } = jobFixture('quality', plan);
    delete steps.ensureFitCheck; // use the real one
    await assert.rejects(factory.finishJob(job, steps), /Quality mode needs the B-roll fit check/);
    assert.deepEqual(calls, [], 'nothing paid or rendered');
  });
});

test('tracker: needs_broll is its own status and waits for inbox clips or retry=yes', () => {
  const row = { status: 'processing', retry: 'no' };
  factory.applyResultToRow(row, { status: 'needs_broll', missing_beats: 3, envato_needed: '/x/processed/job/envato-needed.md', broll_inbox: '/x/broll-inbox/job',
    duration_seconds: 20, transcript: 't', captions: 'c', broll_plan: 'p', transcript_reused: true });
  assert.equal(row.status, 'needs_broll');
  assert.equal(row.stage, 'needs_broll');
  assert.equal(row.output_video_url, '');
  assert.match(row.error_message, /3 important moment\(s\) need a real video clip/);
  assert.equal(factory.rowAllowsProcessing({ ...row, process: 'yes' }), false, 'no endless re-runs');
  assert.equal(factory.rowAllowsProcessing({ ...row, process: 'yes' }, { inboxHasClips: true }), true);
  assert.equal(factory.rowAllowsProcessing({ ...row, process: 'yes', retry: 'yes' }), true);
  const done = { status: 'processing' };
  factory.applyResultToRow(done, { status: 'done', output_video: 'out.mp4', images: 4, duration_seconds: 20 });
  assert.equal(done.status, 'done');
  assert.equal(done.output_video_url, 'out.mp4');
});

test('report JSON: needs_broll is ok (not failed) and lists every waiting job', () => {
  const folder = path.join(os.tmpdir(), 'incoming');
  const rows = [
    { video_name: 'a.mp4', input_path: 'a.mp4', job_id: 'video-a', status: 'needs_broll', error_message: 'Quality mode: 2 important moment(s)...' },
    { video_name: 'b.mp4', input_path: 'b.mp4', job_id: 'video-b', status: 'done' },
  ];
  const report = factory.batchReport([{ status: 'needs_broll', video: 'a.mp4', missing_beats: 2 }],
    { mode: 'quality', videos: [], newlyRegistered: 0, selected: [{}], rows, folder, outputRoot: path.join(folder, 'processed') });
  assert.equal(report.ok, true);
  assert.equal(report.status, 'needs_broll');
  assert.equal(report.broll_mode, 'quality');
  assert.equal(report.waiting_for_broll.length, 1);
  assert.equal(report.waiting_for_broll[0].job_id, 'video-a');
  assert.match(report.waiting_for_broll[0].envato_needed, /a-video-a[\\/]envato-needed\.md$/);
  const failed = factory.batchReport([{ status: 'failed', error: 'x' }, { status: 'needs_broll' }],
    { mode: 'quality', videos: [], newlyRegistered: 0, selected: [], rows: [], folder, outputRoot: folder });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 'processed');
});
