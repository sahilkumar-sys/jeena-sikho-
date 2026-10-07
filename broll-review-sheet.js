// One-page B-roll review: a thumbnail grid (broll-contact-sheet.jpg) plus a
// numbered list (broll-review.md) so a person can check every shot in seconds.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const THUMB_W = 270, THUMB_H = 480, COLUMNS = 4;

function ffmpeg(args) {
  const p = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', args, { encoding: 'utf8' });
  if (p.error || p.status !== 0) throw Error(`ffmpeg: ${p.error || String(p.stderr).slice(-300)}`);
}
function mediaDuration(file) {
  const p = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const value = Number(String(p.stdout).trim());
  return Number.isFinite(value) ? value : 0;
}
function clock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
// The frame people would actually see mid-shot, mirroring render-mixed-broll.js seek clamping.
function thumbnailTime(placement, clipDuration) {
  const maxSeek = Math.max(0, clipDuration - placement.duration - 0.1);
  const seek = Math.min(maxSeek, Math.max(0, Number.isFinite(placement.in_point_seconds) ? placement.in_point_seconds : 0));
  return Math.min(Math.max(0, clipDuration - 0.05), seek + placement.duration / 2);
}
function describe(placement) {
  if (placement.type === 'video') return `video ${placement.asset_id || path.basename(placement.path)}`;
  if (placement.category === 'product') return `real product photo P${placement.product_id}`;
  if (placement.category === 'generated') return 'GENERATED STILL';
  return `real photo ${placement.asset_id || placement.category}`;
}
function reviewMarkdown(placements, plan) {
  const mix = plan?.coverage || {};
  const retrieval = plan?.retrieval || {};
  const lines = [
    '# B-roll review',
    '',
    `Shots: ${placements.length} | videos: ${mix.video_shots ?? '?'} | real photos: ${mix.real_photo_shots ?? '?'} | generated stills: ${mix.generated_still_shots ?? '?'} | video share: ${mix.video_share_of_broll !== undefined ? Math.round(mix.video_share_of_broll * 100) + '%' : '?'}`,
    `Search: ${retrieval.source || 'unknown'}${retrieval.no_match_phrases ? ` | phrases with no good video: ${retrieval.no_match_phrases}` : ''}${retrieval.warning ? ` | WARNING: ${retrieval.warning}` : ''}`,
    '',
    'Thumbnails in broll-contact-sheet.jpg are numbered left to right, top to bottom.',
    '',
    '| # | Time | Media | Spoken words | Why chosen |',
    '| --- | --- | --- | --- | --- |',
  ];
  const cell = value => String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  placements.forEach((p, i) => lines.push(`| ${i + 1} | ${clock(p.start)}-${clock(p.start + p.duration)} | ${describe(p)} | ${cell(p.spoken_context || p.anchor)} | ${cell(p.match_reason || p.prompt)} |`));
  return lines.join('\n') + '\n';
}
function buildReviewSheet(placements, plan, workDir) {
  const dir = path.join(workDir, 'review-thumbs');
  fs.mkdirSync(dir, { recursive: true });
  const thumbs = placements.map((p, i) => {
    const out = path.join(dir, `shot-${String(i + 1).padStart(2, '0')}.png`);
    const scale = `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=increase,crop=${THUMB_W}:${THUMB_H}`;
    if (p.type === 'video') ffmpeg(['-y', '-v', 'error', '-ss', thumbnailTime(p, mediaDuration(p.path)).toFixed(3), '-i', p.path, '-frames:v', '1', '-vf', scale, out]);
    else ffmpeg(['-y', '-v', 'error', '-i', p.path, '-frames:v', '1', '-vf', `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:color=0xF4EEE3`, out]);
    return out;
  });
  const sheet = path.join(workDir, 'broll-contact-sheet.jpg');
  const rows = Math.ceil(thumbs.length / COLUMNS);
  const columns = Math.min(COLUMNS, thumbs.length);
  const layout = thumbs.map((_, i) => `${(i % COLUMNS) * (THUMB_W + 8)}_${Math.floor(i / COLUMNS) * (THUMB_H + 8)}`).join('|');
  const inputs = thumbs.flatMap(file => ['-i', file]);
  const filter = thumbs.length === 1 ? '[0:v]null[out]'
    : `${thumbs.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${thumbs.length}:layout=${layout}:fill=0x202020[out]`;
  ffmpeg(['-y', '-v', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-q:v', '3', sheet]);
  const markdown = path.join(workDir, 'broll-review.md');
  fs.writeFileSync(markdown, reviewMarkdown(placements, plan));
  for (const file of thumbs) fs.rmSync(file, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return { sheet, markdown, rows, columns };
}
module.exports = { buildReviewSheet, reviewMarkdown, thumbnailTime };
