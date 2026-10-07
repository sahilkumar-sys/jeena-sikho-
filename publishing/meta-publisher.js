#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { makeMetaClient } = require('./meta-api');
const { writeLedger } = require('./posting-ledger');

const ROOT = path.resolve(__dirname, '..');
const PROCESSED = path.resolve(process.env.PUBLISHING_PROCESSED_ROOT || path.join(ROOT, 'processed'));
const QUEUE = path.resolve(process.env.PUBLISHING_QUEUE_ROOT || path.join(__dirname, 'queue'));
const LOCK = path.resolve(process.env.PUBLISHING_LOCK_DIR || path.join(__dirname, '.publisher.lockdir'));
const LEDGER = path.resolve(process.env.PUBLISHING_LEDGER_FILE || path.join(__dirname, 'posting-ledger.csv'));

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function probe(video) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', video], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffprobe could not inspect ${path.basename(video)}.`);
  const data = JSON.parse(result.stdout);
  const image = data.streams?.find(stream => stream.codec_type === 'video');
  const audio = data.streams?.find(stream => stream.codec_type === 'audio');
  const duration = Number(data.format?.duration);
  if (!image || !audio || !Number.isFinite(duration) || duration < 3 || duration > 900) {
    throw new Error('Meta publishing requires a video with audio lasting between 3 seconds and 15 minutes.');
  }
  if (image.codec_name !== 'h264' || audio.codec_name !== 'aac' || image.width > 1920 || image.width < 540 || image.height < 960 || Math.abs(image.width / image.height - 9 / 16) > 0.015) {
    throw new Error('Expected a vertical 9:16 H.264/AAC video of at least 540x960 and at most 1920 pixels wide.');
  }
  if (Number(data.format.size) > 1_000_000_000) throw new Error('Video exceeds Instagram’s 1 GB Reel limit.');
  return { duration, width: image.width, height: image.height, bytes: Number(data.format.size), facebook_format: duration >= 4 && duration <= 60 ? 'reel' : 'page_video' };
}

function completedJobs(processedRoot = PROCESSED) {
  if (!fs.existsSync(processedRoot)) return [];
  return fs.readdirSync(processedRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    const dir = path.join(processedRoot, entry.name);
    const manifestPath = path.join(dir, 'assembly-manifest.json');
    const transcriptPath = path.join(dir, 'transcript.json');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(transcriptPath)) return null;
    const manifest = readJson(manifestPath);
    const video = path.join(dir, path.basename(String(manifest.output_video || '')));
    if (!video.endsWith('-final.mp4') || !fs.existsSync(video)) return null;
    return { id: entry.name, dir, video, transcriptPath, modified: fs.statSync(video).mtimeMs };
  }).filter(Boolean).sort((a, b) => b.modified - a.modified);
}

function syncLedger() { return writeLedger(completedJobs(), QUEUE, LEDGER, ROOT); }

function cleanJson(text) {
  const value = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = value.indexOf('{'), end = value.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The title model did not return a JSON object.');
  return JSON.parse(value.slice(start, end + 1));
}

function validMetadata(title, description) {
  if (typeof title !== 'string' || !title.trim() || title.length > 100) throw new Error('Title must contain 1–100 characters.');
  if (typeof description !== 'string' || !description.trim() || description.length > 1800) throw new Error('Description must contain 1–1800 characters.');
  if (`${title}\n\n${description}`.length > 2200) throw new Error('Instagram caption exceeds 2,200 characters.');
}

async function generateMetadata(transcript, fetchImpl = fetch) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is needed to prepare posting drafts.');
  const url = process.env.LLM_API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const model = process.env.PUBLISHING_LLM_MODEL || process.env.LLM_MODEL || 'gemini-3.8-flash';
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0.35, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Write a truthful title and social caption for a short video. Return only JSON with string fields title and description. Use the spoken language of the transcript. Keep title under 100 characters and description under 1800 characters. State only what the transcript supports. Do not invent medical claims, outcomes, credentials, or testimonials. Avoid clickbait. Make the caption suitable for both Instagram and Facebook.' },
        { role: 'user', content: `TRANSCRIPT:\n${transcript.slice(0, 22000)}` },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(`Title generation failed: ${data.error?.message || `HTTP ${response.status}`}`);
  const draft = cleanJson(data.choices?.[0]?.message?.content);
  const title = String(draft.title || '').trim();
  const description = String(draft.description || '').trim();
  validMetadata(title, description);
  return { title, description, model };
}

async function prepareJobs(maxNew = 1, fetchImpl = fetch, processedRoot = PROCESSED, queueRoot = QUEUE) {
  fs.mkdirSync(queueRoot, { recursive: true });
  const prepared = [];
  for (const source of completedJobs(processedRoot)) {
    if (prepared.length >= maxNew) break;
    const reviewPath = path.join(queueRoot, `${source.id}.json`);
    if (fs.existsSync(reviewPath)) continue;
    const transcript = readJson(source.transcriptPath);
    if (!String(transcript.text || '').trim()) throw new Error(`Transcript is empty for ${source.id}.`);
    const video = probe(source.video);
    const metadata = await generateMetadata(transcript.text, fetchImpl);
    atomicJson(reviewPath, {
      job_id: source.id,
      video_path: source.video,
      video_sha256: hashFile(source.video),
      transcript_path: source.transcriptPath,
      duration_seconds: Number(video.duration.toFixed(3)),
      title: metadata.title,
      description: metadata.description,
      approval: 'pending',
      publish_at: null,
      facebook_destination: video.facebook_format,
      instagram: { status: 'pending' },
      facebook: { status: 'pending', format: video.facebook_format },
      created_at: new Date().toISOString(),
      metadata_model: metadata.model,
    });
    if (queueRoot === QUEUE && processedRoot === PROCESSED) syncLedger();
    prepared.push({ job_id: source.id, review_file: reviewPath });
  }
  return prepared;
}

function due(job, now = new Date()) {
  if (job.approval !== 'approved') return false;
  if (job.publish_at === null || job.publish_at === '') return true;
  if (typeof job.publish_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(job.publish_at)) {
    throw new Error('publish_at must be null or an ISO date/time with timezone, such as 2026-09-25T18:00:00+05:30.');
  }
  const when = new Date(job.publish_at);
  if (!Number.isFinite(when.getTime())) throw new Error('publish_at is not a valid date/time.');
  return when <= now;
}

async function publishReady(fetchImpl = fetch, queueRoot = QUEUE) {
  const results = [];
  if (!fs.existsSync(queueRoot)) return results;
  for (const name of fs.readdirSync(queueRoot).filter(name => name.endsWith('.json')).sort()) {
    const reviewPath = path.join(queueRoot, name);
    const job = readJson(reviewPath);
    if (!due(job)) continue;
    if (job.instagram?.status === 'published' && job.facebook?.status === 'published') continue;
    const save = () => {
      atomicJson(reviewPath, job);
      if (queueRoot === QUEUE) syncLedger();
    };
    validMetadata(job.title, job.description);
    if (!fs.existsSync(job.video_path) || hashFile(job.video_path) !== job.video_sha256) {
      throw new Error(`Approved video changed or is missing: ${job.job_id}. No post was sent.`);
    }
    const expected = probe(job.video_path).facebook_format;
    if (job.facebook?.format !== expected || job.facebook_destination !== expected) {
      throw new Error(`Facebook destination no longer matches the video duration for ${job.job_id}. No post was sent.`);
    }
    const config = {
      version: process.env.META_GRAPH_VERSION || 'v26.0',
      pageId: process.env.META_PAGE_ID,
      igId: process.env.META_IG_USER_ID,
      token: process.env.META_PAGE_ACCESS_TOKEN,
    };
    const client = makeMetaClient(config, fetchImpl);
    for (const platform of ['instagram', 'facebook']) {
      if (['published', 'needs_review'].includes(job[platform].status)) continue;
      if (job[platform].status === 'publishing') {
        job[platform].status = 'needs_review';
        job[platform].last_error = 'An earlier publish request may have succeeded. Verify the Meta account before retrying.';
        save();
        continue;
      }
      try {
        await client[platform](job, save);
      } catch (error) {
        job[platform].status = 'needs_review';
        job[platform].last_error = String(error.message || error).slice(0, 500);
        save();
      }
    }
    results.push({ job_id: job.job_id, instagram: job.instagram.status, facebook: job.facebook.status });
  }
  return results;
}

function withLock(action) {
  if (process.platform !== 'linux') throw new Error('Run the publishing queue inside the n8n Linux container.');
  try {
    fs.mkdirSync(path.dirname(LOCK), { recursive: true });
    fs.mkdirSync(LOCK);
  } catch (error) {
    if (error.code === 'EEXIST') return Promise.resolve({ status: 'busy', prepared: [], posts: [] });
    throw error;
  }
  try {
    return Promise.resolve(action()).finally(() => fs.rmdirSync(LOCK));
  } catch (error) {
    fs.rmdirSync(LOCK);
    throw error;
  }
}

async function main(args = process.argv.slice(2)) {
  const command = args.includes('--sync-csv') ? 'sync-csv' : args.includes('--prepare') ? 'prepare' : args.includes('--publish') ? 'publish' : args.includes('--check') ? 'check' : 'run';
  const limitIndex = args.indexOf('--max-new');
  const maxNew = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 1;
  if (!Number.isInteger(maxNew) || maxNew < 0 || maxNew > 10) throw new Error('--max-new must be an integer from 0 to 10.');
  if (command === 'sync-csv') return { status: 'synced', ledger: syncLedger() };
  if (command === 'check') return { status: 'checked', completed_jobs: completedJobs().length, queued_jobs: fs.existsSync(QUEUE) ? fs.readdirSync(QUEUE).filter(name => name.endsWith('.json')).length : 0 };
  return withLock(async () => {
    const report = { status: 'ok', prepared: [], posts: [] };
    report.ledger = syncLedger();
    if (command !== 'publish') report.prepared = await prepareJobs(maxNew);
    if (command !== 'prepare') report.posts = await publishReady();
    report.ledger = syncLedger();
    return report;
  });
}

if (require.main === module) {
  main().then(report => {
    if (process.argv.includes('--report-json')) console.log(`PUBLISHER_REPORT_JSON=${JSON.stringify(report)}`);
    else console.log(JSON.stringify(report, null, 2));
  }).catch(error => {
    const report = { status: 'error', error: String(error.message || error) };
    if (process.argv.includes('--report-json')) console.log(`PUBLISHER_REPORT_JSON=${JSON.stringify(report)}`);
    else console.error(report.error);
    process.exitCode = 1;
  });
}

module.exports = { probe, completedJobs, cleanJson, validMetadata, generateMetadata, due, prepareJobs, publishReady, syncLedger, main };
