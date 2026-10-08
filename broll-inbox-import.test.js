'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { importInbox, nextAssetId } = require('./broll-inbox-import');
const factory = require('./video-broll-factory');

const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0
  && spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-version']).status === 0;
const skip = !hasFfmpeg && 'ffmpeg/ffprobe not installed';

function clip(file, seconds, source = 'testsrc') {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `${source}=size=320x240:rate=25:duration=${seconds}`,
    '-pix_fmt', 'yuv420p', file]);
  assert.equal(result.status, 0, String(result.stderr));
  return file;
}
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// A throwaway project: broll-assets with one existing library clip, and a job inbox.
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-project-'));
  fs.mkdirSync(path.join(root, 'broll-assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'broll-assets', 'asset-map.json'), JSON.stringify({ assets: { B001: 'library-heron.mp4' } }));
  const inbox = path.join(root, 'broll-inbox', 'video-job1');
  fs.mkdirSync(inbox, { recursive: true });
  return { root, inbox, stock: path.join(root, 'broll-assets') };
}

test('asset IDs continue after the highest existing E number', () => {
  assert.equal(nextAssetId({ B001: 'a' }, {}), 'E0001');
  assert.equal(nextAssetId({ B001: 'a' }, { E0007: 'x', U0002: 'y' }), 'E0008');
});

test('a valid clip is copied, approved with provenance, and the original moved to imported/', { skip }, async () => {
  const { root, inbox, stock } = project();
  const dropped = clip(path.join(inbox, 'Knee Pain Elderly Man (4K).mp4'), 3);
  const fingerprint = sha(dropped);
  const before = factory.approvalFingerprint(root);
  const report = await importInbox({ projectRoot: root, jobId: 'video-job1', inboxDir: inbox, minAgeSeconds: 0 });
  assert.deepEqual(report.rejected, []);
  assert.equal(report.imported.length, 1);
  const { asset_id: id, path: relative } = report.imported[0];
  assert.equal(id, 'E0001');
  assert.equal(relative, 'inbox/video-job1/Knee-Pain-Elderly-Man-4K.mp4');
  assert.equal(sha(path.join(stock, relative)), fingerprint, 'copy is byte-identical');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stock, 'local-asset-map.json'), 'utf8')).assets, { E0001: relative });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'local-approved-stock-ids.json'), 'utf8')), ['E0001']);
  const log = fs.readFileSync(path.join(stock, 'approval-log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(log.length, 1);
  assert.equal(log[0].sha256, fingerprint);
  assert.equal(log[0].source, 'envato-inbox');
  assert.equal(log[0].approved_by, 'user inbox drop');
  assert.equal(log[0].job, 'video-job1');
  assert.ok(log[0].duration_seconds >= 2.9);
  assert.equal(fs.existsSync(dropped), false);
  assert.ok(fs.existsSync(path.join(inbox, 'imported', 'Knee Pain Elderly Man (4K).mp4')), 'user file kept, moved aside');
  assert.notDeepEqual(factory.approvalFingerprint(root), before, 'plan key changes, so the job is planned again');
});

test('duplicates, damaged files and too-short clips are rejected with a reason and never copied', { skip }, async () => {
  const { root, inbox, stock } = project();
  clip(path.join(stock, 'library-heron.mp4'), 3, 'testsrc2');
  fs.copyFileSync(path.join(stock, 'library-heron.mp4'), path.join(inbox, 'same-as-library.mp4'));
  clip(path.join(inbox, 'first.mp4'), 3);
  fs.copyFileSync(path.join(inbox, 'first.mp4'), path.join(inbox, 'second-copy.mp4'));
  fs.writeFileSync(path.join(inbox, 'zero-filled.mp4'), Buffer.alloc(4096));
  clip(path.join(inbox, 'too-short.mp4'), 1, 'smptebars');
  const report = await importInbox({ projectRoot: root, jobId: 'video-job1', inboxDir: inbox, minAgeSeconds: 0 });
  assert.deepEqual(report.imported.map(c => c.file), ['first.mp4']);
  const reasons = Object.fromEntries(report.rejected.map(r => [r.file, r.reason]));
  assert.match(reasons['same-as-library.mp4'], /already in the B-roll library \(library-heron\.mp4\)/);
  assert.match(reasons['second-copy.mp4'], /already in the B-roll library as E0001/);
  assert.match(reasons['zero-filled.mp4'], /no valid video header/);
  assert.match(reasons['too-short.mp4'], /too short/);
  assert.equal(fs.readdirSync(path.join(stock, 'inbox', 'video-job1')).length, 1, 'only the good clip was copied');
  assert.match(fs.readFileSync(path.join(inbox, 'rejected', 'zero-filled.mp4.reason.txt'), 'utf8'), /Not imported: damaged/);
  assert.equal(fs.readdirSync(inbox).filter(n => n.endsWith('.mp4')).length, 0, 'nothing left to loop on');
});

test('a file still being copied, or a missing ffprobe, leaves the user file in place', { skip }, async () => {
  const { root, inbox } = project();
  const fresh = clip(path.join(inbox, 'downloading.mp4'), 3);
  const waiting = await importInbox({ projectRoot: root, jobId: 'video-job1', inboxDir: inbox, minAgeSeconds: 3600 });
  assert.deepEqual(waiting.still_copying, ['downloading.mp4']);
  assert.ok(fs.existsSync(fresh));
  const previous = process.env.FFPROBE_PATH;
  process.env.FFPROBE_PATH = path.join(root, 'no-such-ffprobe');
  try {
    const report = await importInbox({ projectRoot: root, jobId: 'video-job1', inboxDir: inbox, minAgeSeconds: 0 });
    assert.equal(report.deferred.length, 1);
    assert.match(report.deferred[0].reason, /ffprobe could not start/);
    assert.deepEqual(report.rejected, []);
    assert.ok(fs.existsSync(fresh), 'not moved to rejected/ for an environment problem');
  } finally {
    if (previous === undefined) delete process.env.FFPROBE_PATH; else process.env.FFPROBE_PATH = previous;
  }
});

test('a clip already imported for this job before a crash is just moved to imported/', { skip }, async () => {
  const { root, inbox, stock } = project();
  const dropped = clip(path.join(inbox, 'clip.mp4'), 3);
  fs.mkdirSync(path.join(stock, 'inbox', 'video-job1'), { recursive: true });
  fs.copyFileSync(dropped, path.join(stock, 'inbox', 'video-job1', 'clip.mp4'));
  fs.writeFileSync(path.join(stock, 'local-asset-map.json'), JSON.stringify({ assets: { E0001: 'inbox/video-job1/clip.mp4' } }));
  fs.writeFileSync(path.join(stock, 'approval-log.jsonl'), `${JSON.stringify({ asset_id: 'E0001', file: 'inbox/video-job1/clip.mp4', original_name: 'clip.mp4', sha256: sha(dropped), job: 'video-job1' })}\n`);
  const report = await importInbox({ projectRoot: root, jobId: 'video-job1', inboxDir: inbox, minAgeSeconds: 0 });
  assert.deepEqual(report.already_imported, [{ file: 'clip.mp4', asset_id: 'E0001' }]);
  assert.deepEqual(report.imported, []);
  assert.ok(fs.existsSync(path.join(inbox, 'imported', 'clip.mp4')));
});

test('factory import refreshes the visual index only when something new was approved', { skip }, async () => {
  const { root, inbox } = project();
  const previous = process.env.BROLL_INBOX_MIN_AGE_SECONDS;
  process.env.BROLL_INBOX_MIN_AGE_SECONDS = '0';
  try {
    let refreshes = 0;
    const refresh = async () => { refreshes += 1; return { ok: true, indexed_approved_clips: 22 }; };
    clip(path.join(inbox, 'new.mp4'), 3);
    const first = await factory.importJobInbox('video-job1', { projectRoot: root, inboxDir: inbox, refresh });
    assert.equal(first.imported.length, 1);
    assert.equal(first.index_refresh, 'ok: 22 approved clips indexed');
    const second = await factory.importJobInbox('video-job1', { projectRoot: root, inboxDir: inbox, refresh });
    assert.equal(second.imported.length, 0);
    assert.equal(refreshes, 1);
    const down = async () => { throw new Error('connect ECONNREFUSED'); };
    clip(path.join(inbox, 'another.mp4'), 4, 'testsrc2');
    const third = await factory.importJobInbox('video-job1', { projectRoot: root, inboxDir: inbox, refresh: down });
    assert.equal(third.imported[0].asset_id, 'E0002');
    assert.match(third.index_refresh, /^warning: connect ECONNREFUSED/, 'import still counts when the service is down');
  } finally {
    if (previous === undefined) delete process.env.BROLL_INBOX_MIN_AGE_SECONDS; else process.env.BROLL_INBOX_MIN_AGE_SECONDS = previous;
  }
});
