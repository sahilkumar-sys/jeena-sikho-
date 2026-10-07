// Phase 3: Quality / Quantity B-roll mode.
// Quality stops before image generation and rendering when an important spoken
// moment has no good approved video, and writes an Envato shopping list.
// Quantity always renders (best approved video -> up to the still cap -> presenter)
// and writes the same list marked optional.
// User decisions (docs/DECISIONS.md, 2026-10-07): only important moments count
// (the planner lists them; greetings/filler never do), and in Quality mode a
// generated still is not accepted: that moment goes on the Envato list instead.
const fs = require('fs');
const path = require('path');
const { atomicWrite, writeJson } = require('./factory-state');
const { queriesFromWords } = require('./vector-retrieval-client');

const MODES = ['quality', 'quantity'];
const DEFAULT_MODE = 'quantity';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const MERGE_SECONDS = 1; // two reports of the same moment
const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'with', 'his', 'her', 'their', 'its', 'is', 'are', 'being', 'into', 'from', 'for', 'by', 'some', 'very', 'showing', 'shows', 'close', 'up', 'shot', 'view', 'scene', 'video', 'stock', 'footage']);
const PEOPLE = /\b(man|men|woman|women|person|people|child|children|kid|kids|boy|girl|doctor|patient|elderly|family|mother|father|baby)\b/i;
const ORIENTATION = 'Vertical 9:16 is best. A horizontal clip works only if the main subject is in the middle third: the factory crops away the left and right sides.';

function parseMode(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_MODE;
  const text = String(value).trim().toLowerCase();
  if (!MODES.includes(text)) throw new Error(`B-roll mode must be "quality" or "quantity"; received "${value}".`);
  return text;
}

// CLI --broll-mode wins over BROLL_MODE; default quantity keeps the old always-render behaviour.
function resolveMode(args = {}, env = process.env) {
  return parseMode(args['broll-mode'] !== undefined ? args['broll-mode'] : env.BROLL_MODE);
}

function clock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function spokenBetween(words, start, end) {
  return words.filter(w => Number(w.start) >= start - 0.05 && Number(w.start) < end)
    .map(w => String(w.text || w.word || '').trim()).filter(Boolean).join(' ');
}

// Envato search strings from the English visual description.
function searchTerms(english) {
  const text = String(english || '').replace(/[^A-Za-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const words = text.split(' ');
  const full = words.slice(0, 8).join(' ').toLowerCase();
  const keywords = words.filter(w => !STOP.has(w.toLowerCase()) && w.length > 2 && !/^indian$/i.test(w)).slice(0, 4).join(' ').toLowerCase();
  const terms = [full];
  if (keywords && keywords !== full) terms.push(keywords);
  if (keywords && PEOPLE.test(text)) terms.push(`indian ${keywords}`);
  return [...new Set(terms)];
}

function phraseWindow(phrases, start) {
  return phrases.find(p => start >= p.at - 0.25 && start <= p.end + 0.25) || null;
}

// The important moments without a good approved video, in time order.
// mode only changes whether a generated still counts (quality) or is an optional upgrade (quantity).
function missingBeats(plan, transcriptWords, duration) {
  const words = transcriptWords || [];
  const phrases = queriesFromWords(words, duration);
  const english = Array.isArray(plan?.retrieval?.queries) ? plan.retrieval.queries : [];
  const englishAt = start => (english.find(q => start >= q.at - 0.25 && start <= (q.end ?? q.at) + 0.25) || {}).text || '';
  const raw = [];
  for (const d of plan?.fit_check?.details || []) {
    if (!['dropped', 'weak'].includes(d.action) || !Number.isFinite(d.start_seconds)) continue;
    raw.push({ start: d.start_seconds, length: d.duration_seconds || 3, english: d.phrase || englishAt(d.start_seconds),
      reason: d.action === 'dropped' ? 'no approved video fits (the planned clip was removed)' : 'only a weak approved video fits',
      source: `fit_check_${d.action}`, planned_asset: d.planned_asset || null });
  }
  for (const item of plan?.images || []) {
    if (item.media_type !== 'generated_image') continue;
    raw.push({ start: item.start_seconds, length: item.duration_seconds || 3, english: item.prompt || englishAt(item.start_seconds),
      reason: 'no video fits; the plan would use an AI picture here', source: 'generated_still' });
  }
  // Moments the planner marked important but left uncovered. Skip any already covered by a shot.
  const covered = (plan?.images || []).filter(i => i.media_type !== 'generated_image' && i.fit?.action !== 'weak');
  for (const beat of plan?.missing_beats || []) {
    const start = beat.start_seconds;
    if (covered.some(i => start >= i.start_seconds - 0.5 && start < i.start_seconds + (i.duration_seconds || 3))) continue;
    raw.push({ start, length: 3, english: beat.visual_query || englishAt(start), reason: 'important moment with no fitting approved video', source: 'planner' });
  }
  raw.sort((a, b) => a.start - b.start);
  const beats = [];
  for (const beat of raw) {
    const previous = beats[beats.length - 1];
    if (previous && Math.abs(beat.start - previous.start) < MERGE_SECONDS) continue;
    beats.push(beat);
  }
  return beats.map((beat, index) => {
    const phrase = phraseWindow(phrases, beat.start);
    const length = Math.min(4.2, Math.max(2.1, beat.length));
    // Through the end of the spoken phrase, so the list shows the whole idea, never another phrase's start.
    const end = Math.min(duration, Math.max(beat.start + length, Math.min(phrase?.end ?? 0, beat.start + 7)));
    return {
      n: index + 1,
      start_seconds: Number(beat.start.toFixed(2)),
      end_seconds: Number(end.toFixed(2)),
      time: `${clock(beat.start)}-${clock(end)}`,
      spoken: spokenBetween(words, beat.start, end) || phrase?.text || '',
      english: beat.english,
      search_terms: searchTerms(beat.english),
      min_clip_seconds: Math.ceil(length) + 2, // room to pick the best part
      orientation: ORIENTATION,
      reason: beat.reason,
      source: beat.source,
      ...(beat.planned_asset ? { planned_asset: beat.planned_asset } : {}),
    };
  });
}

function inboxRoot(projectRoot) {
  return path.resolve(process.env.BROLL_INBOX_DIR || path.join(projectRoot, 'broll-inbox'));
}

function inboxDir(projectRoot, jobId) {
  return path.join(inboxRoot(projectRoot), String(jobId).replace(/[^A-Za-z0-9._-]+/g, '-'));
}

// Video files waiting in the job inbox (top level only; imported/ and rejected/ are done).
function inboxClips(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map(e => path.join(dir, e.name)).sort();
}

function envatoMarkdown(list) {
  const cell = value => String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const head = list.required
    ? ['**Quality mode: this video was NOT rendered.** These moments need a real video clip first.']
    : ['Quantity mode: the video was rendered anyway. These clips are **optional** — they would replace a weak clip, an AI picture, or presenter-only moments.'];
  return [
    `# Envato clips needed — ${list.video}`,
    '',
    ...head,
    '',
    `1. Search Envato with the words in the table. Download clips at least as long as shown.`,
    `2. Put the downloaded files in: \`${list.inbox}\``,
    '3. Run the factory again. It checks, copies and indexes the clips, then plans this video again.',
    '',
    'Putting a clip in that folder means **you approve it**: you have the licence, and any people in it are fine to show (prefer Indian people and settings). Only real video, no AI video.',
    '',
    '| # | Time | Spoken words | What to show | Search Envato for | Clip length | Why |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...list.beats.map(b => `| ${b.n} | ${b.time} | ${cell(b.spoken)} | ${cell(b.english)} | ${cell(b.search_terms.join('; '))} | ≥ ${b.min_clip_seconds} s | ${cell(b.reason)} |`),
    '',
    `Orientation: ${ORIENTATION}`,
    '',
  ].join('\n');
}

function writeEnvatoList(workDir, { video, jobId, mode, inbox }, beats) {
  const list = { video, job_id: jobId, mode, required: mode === 'quality', created_at: new Date().toISOString(), inbox, beats };
  const json = path.join(workDir, 'envato-needed.json');
  const markdown = path.join(workDir, 'envato-needed.md');
  writeJson(json, list);
  atomicWrite(markdown, envatoMarkdown(list));
  return { json, markdown, count: beats.length, required: list.required };
}

// Old lists must not linger once every moment is covered.
function clearEnvatoList(workDir) {
  for (const name of ['envato-needed.json', 'envato-needed.md']) fs.rmSync(path.join(workDir, name), { force: true });
}

function prepareInbox(dir, { video, jobId, envatoMarkdownPath }) {
  fs.mkdirSync(dir, { recursive: true });
  atomicWrite(path.join(dir, 'README.txt'), [
    `B-roll inbox for: ${video}`,
    `Job: ${jobId}`,
    '',
    `The list of clips needed is in: ${envatoMarkdownPath}`,
    '',
    'Put downloaded Envato video files (MP4/MOV) directly in this folder, then run the factory again.',
    'Putting a clip here means you approve it: you have the licence and any people in it are fine to show.',
    'The factory checks each file, copies it into broll-assets/inbox/, records where it came from,',
    'then moves your file into imported/ (or rejected/ with a reason). Real video only, no AI video.',
    '',
  ].join('\r\n'));
  return dir;
}

module.exports = { MODES, DEFAULT_MODE, parseMode, resolveMode, missingBeats, searchTerms, writeEnvatoList, clearEnvatoList, envatoMarkdown, prepareInbox, inboxRoot, inboxDir, inboxClips, ORIENTATION };
