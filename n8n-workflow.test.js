'use strict';

// Static checks of video-broll-factory-workflow.json: the node code is run here with
// fake inputs because n8n itself is not available in this test environment.
const assert = require('node:assert/strict');
const test = require('node:test');

const workflow = require('./video-broll-factory-workflow.json');
const node = name => workflow.nodes.find(n => n.name === name);
const command = workflow.nodes.find(n => n.type === 'n8n-nodes-base.executeCommand');
const runReport = stdout => new Function('$json', node('Report factory result').parameters.jsCode)({ stdout })[0].json;
const batch = report => `log line\nBATCH_RESULT=${JSON.stringify(report)}\n`;

test('schedule stays inactive and the Set node offers broll_mode (default quantity)', () => {
  assert.equal(workflow.active, false);
  const fields = Object.fromEntries(node('Set factory inputs').parameters.assignments.assignments.map(a => [a.name, a.value]));
  assert.equal(fields.broll_mode, 'quantity');
});

test('the command passes --broll-mode as one safely quoted argument', () => {
  const expression = command.parameters.command.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  const build = mode => new Function('$json', `return ${expression}`)({ video_folder: '/f/in', control_file: '/f/c.csv', output_root: '/f/p', max_videos: 1, broll_mode: mode });
  assert.match(build('Quality'), /'--broll-mode' 'quality' '--report-json'$/);
  assert.match(build(undefined), /'--broll-mode' 'quantity'/);
  assert.match(build("x'; rm -rf /"), /'--broll-mode' 'x'\\''; rm -rf \/' '--report-json'$/);
});

test('report: needs_broll is a normal result with a plain-English summary', () => {
  const out = runReport(batch({ ok: true, status: 'needs_broll', broll_mode: 'quality', results: [{
    status: 'needs_broll', video: '/files/heygen-workflow/incoming/knee.mp4', missing_beats: 2,
    envato_needed: '/files/heygen-workflow/processed/knee-video-a/envato-needed.md', broll_inbox: '/files/heygen-workflow/broll-inbox/video-a',
    envato_moments: [{ time: '0:02.0-0:05.0', show: 'elderly man with knee pain', search: 'elderly man knee pain' }],
    inbox_import: { imported: [{ asset_id: 'E0003' }], rejected: [{ file: 'bad.mp4', reason: 'too short' }], index_refresh: 'ok: 25 approved clips indexed' },
  }], waiting_for_broll: [
    { video: 'knee.mp4', envato_needed: 'processed/knee-video-a/envato-needed.md', inbox: 'broll-inbox/video-a' },
    { video: 'older.mp4', envato_needed: 'processed/older-video-b/envato-needed.md', inbox: 'broll-inbox/video-b' },
  ] }));
  assert.equal(out.status, 'needs_broll');
  assert.match(out.summary, /^NOT rendered \(quality mode\) knee\.mp4: 2 important moment\(s\) need a real video clip\./);
  assert.match(out.summary, /List: processed\/knee-video-a\/envato-needed\.md \| Drop clips in: broll-inbox\/video-a/);
  assert.match(out.summary, /0:02\.0-0:05\.0 elderly man with knee pain \| search Envato: "elderly man knee pain"/);
  assert.match(out.summary, /Inbox: imported 1 \(E0003\), rejected 1 \(bad\.mp4: too short\)/);
  assert.match(out.summary, /Still waiting for clips: older\.mp4/);
  assert.doesNotMatch(out.summary, /Still waiting for clips: knee\.mp4/, 'the job handled in this run is not listed twice');
  const windows = runReport(batch({ ok: true, status: 'needs_broll', results: [{ status: 'needs_broll', video: 'C:\\in\\knee.mp4', missing_beats: 1 }],
    waiting_for_broll: [{ video: 'knee.mp4', envato_needed: 'x', inbox: 'y' }] }));
  assert.doesNotMatch(windows.summary, /Still waiting/, 'Windows paths are matched by file name too');
});

test('report: rendered videos show the B-roll mix and optional clips; failures still stop the workflow', () => {
  const out = runReport(batch({ ok: true, status: 'processed', broll_mode: 'quantity', results: [{
    status: 'done', video: '/files/heygen-workflow/incoming/tea.mp4', output_video: '/files/heygen-workflow/processed/tea/tea-final.mp4',
    broll_mix: { video_shots: 5, real_photo_shots: 1, generated_still_shots: 1 }, missing_beats: 1, envato_needed: '/files/heygen-workflow/processed/tea/envato-needed.md', envato_moments: [],
  }] }));
  assert.match(out.summary, /^Rendered tea\.mp4 \(quantity mode\): processed\/tea\/tea-final\.mp4 \| B-roll: 5 video, 1 real photo, 1 AI still/);
  assert.match(out.summary, /Optional: 1 moment\(s\) could use a better clip/);
  assert.equal(runReport(batch({ ok: true, status: 'idle', results: [] })).summary, 'No new video to process.');
  assert.throws(() => runReport(batch({ ok: false, status: 'processed', results: [{ status: 'failed', error: 'Quality mode needs the B-roll fit check' }] })), /Quality mode needs the B-roll fit check/);
  assert.throws(() => runReport('no report'), /did not emit a batch report/);
});
