// Phase 4: import Envato clips the user drops into broll-inbox/<job-id>/.
// User decision (docs/DECISIONS.md): dropping a clip there counts as approval
// (licence and people check done by the user). Every import is recorded with
// its fingerprint in broll-assets/approval-log.jsonl.
//
// Per file: still being written? -> leave for the next run. Video header, ffprobe
// readable, >= 2.5 s, not already in the library (SHA-256) -> verified copy into
// broll-assets/inbox/<job-id>/, new E#### ID in the local map and approvals, log
// entry, then the user's file moves to imported/ (or rejected/ with a reason).
// The user's file is never moved or changed before its copy is verified.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { atomicWrite, writeJson, fileHash } = require('./factory-state');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
const MP4_BOXES = new Set(['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip', 'pnot', 'uuid']);
const MIN_CLIP_SECONDS = 2.5;
const ID_PREFIX = 'E';

// A problem with the clip itself: it goes to rejected/. Any other error (missing ffprobe,
// full disk, permissions) leaves the user's file in place for the next run.
function contentError(message) {
  const error = new Error(message);
  error.content = true;
  return error;
}

// Same rule as vector-index/index_clips.py check_video_header.
function checkVideoHeader(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(12);
  let read;
  try { read = fs.readSync(fd, head, 0, 12, 0); } finally { fs.closeSync(fd); }
  const bytes = head.subarray(0, read);
  const suffix = path.extname(file).toLowerCase();
  let ok;
  if (['.mp4', '.mov', '.m4v'].includes(suffix)) ok = bytes.length >= 8 && MP4_BOXES.has(bytes.subarray(4, 8).toString('latin1'));
  else if (['.mkv', '.webm'].includes(suffix)) ok = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  else if (suffix === '.avi') ok = bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'AVI ';
  else ok = bytes.length > 0;
  if (!ok) throw contentError(`damaged or incomplete file: no valid video header (starts with ${bytes.subarray(0, 8).toString('hex') || 'nothing'})`);
}

function probeClip(file) {
  const result = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (result.error) throw new Error(`ffprobe could not start: ${result.error.message}`);
  if (result.status !== 0) throw contentError(`ffprobe cannot read it (${String(result.stderr || '').trim().slice(0, 160)})`);
  const data = JSON.parse(result.stdout || '{}');
  const stream = (data.streams || [])[0];
  const duration = Number(data.format?.duration);
  if (!stream?.width || !stream?.height) throw contentError('no video picture stream');
  if (!Number.isFinite(duration) || duration < MIN_CLIP_SECONDS) throw contentError(`too short (${Number.isFinite(duration) ? duration.toFixed(1) : '?'} s; needs at least ${MIN_CLIP_SECONDS} s)`);
  return { duration_seconds: Number(duration.toFixed(3)), width: Number(stream.width), height: Number(stream.height) };
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return fallback; }
}

function readLog(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

// Library duplicate by content: the approval log first, then only library files of the same size.
async function findDuplicate(sha256, size, stockDir, logEntries) {
  const logged = logEntries.find(entry => entry.sha256 === sha256);
  if (logged) return { asset_id: logged.asset_id, file: logged.file, job: logged.job, original_name: logged.original_name };
  for (const file of walkFiles(stockDir)) {
    if (fs.statSync(file).size !== size) continue;
    if (await fileHash(file) === sha256) return { asset_id: null, file: path.relative(stockDir, file).split(path.sep).join('/') };
  }
  return null;
}

function nextAssetId(...maps) {
  let max = 0;
  for (const map of maps) for (const id of Object.keys(map)) {
    const match = new RegExp(`^${ID_PREFIX}(\\d+)$`).exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${ID_PREFIX}${String(max + 1).padStart(4, '0')}`;
}

function safeFileName(name) {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name)).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'clip';
  return `${base}${ext}`;
}

function freePath(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base}-${n}${ext}`);
  return candidate;
}

async function verifiedCopy(source, target, sha256) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.${crypto.randomUUID()}.part`;
  try {
    fs.copyFileSync(source, partial, fs.constants.COPYFILE_EXCL);
    if (await fileHash(partial) !== sha256) throw new Error('copy verification failed (SHA-256 differs)');
    fs.renameSync(partial, target);
  } finally {
    fs.rmSync(partial, { force: true });
  }
}

function moveAside(file, dir, reason) {
  fs.mkdirSync(dir, { recursive: true });
  const target = freePath(dir, path.basename(file));
  fs.renameSync(file, target);
  if (reason) atomicWrite(`${target}.reason.txt`, `${reason}\r\n`);
  return target;
}

// Waiting clips: top-level video files old enough not to be mid-copy.
function pendingClips(inboxDir, minAgeSeconds) {
  if (!fs.existsSync(inboxDir)) return { ready: [], waiting: [] };
  const files = fs.readdirSync(inboxDir, { withFileTypes: true })
    .filter(e => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map(e => path.join(inboxDir, e.name)).sort();
  const now = Date.now();
  const ready = [], waiting = [];
  for (const file of files) (now - fs.statSync(file).mtimeMs >= minAgeSeconds * 1000 ? ready : waiting).push(file);
  return { ready, waiting };
}

async function importInbox({ projectRoot, jobId, inboxDir, approvedBy = 'user inbox drop', minAgeSeconds }) {
  const minAge = Number.isFinite(Number(minAgeSeconds)) ? Number(minAgeSeconds)
    : Math.max(0, Number(process.env.BROLL_INBOX_MIN_AGE_SECONDS ?? 30) || 0);
  const stockDir = path.join(projectRoot, 'broll-assets');
  const mapFile = path.join(stockDir, 'local-asset-map.json');
  const approvalsFile = path.join(projectRoot, 'local-approved-stock-ids.json');
  const logFile = path.join(stockDir, 'approval-log.jsonl');
  const jobFolder = String(jobId).replace(/[^A-Za-z0-9._-]+/g, '-');
  const { ready, waiting } = pendingClips(inboxDir, minAge);
  const report = { job: jobId, imported: [], rejected: [], deferred: [], already_imported: [], still_copying: waiting.map(f => path.basename(f)) };
  if (!ready.length) return report;
  const baseMap = readJson(path.join(stockDir, 'asset-map.json'), { assets: {} }).assets || {};
  const localMap = readJson(mapFile, { assets: {} });
  localMap.assets ||= {};
  const approvals = readJson(approvalsFile, []);
  const log = readLog(logFile);
  for (const file of ready) {
    const name = path.basename(file);
    try {
      checkVideoHeader(file);
      const info = probeClip(file);
      const size = fs.statSync(file).size;
      const sha256 = await fileHash(file);
      const duplicate = await findDuplicate(sha256, size, stockDir, log);
      if (duplicate) {
        // An earlier run copied and approved it but stopped before moving the user's file.
        if (duplicate.job === jobId && duplicate.original_name === name && duplicate.asset_id && localMap.assets[duplicate.asset_id]) {
          moveAside(file, path.join(inboxDir, 'imported'));
          report.already_imported.push({ file: name, asset_id: duplicate.asset_id });
          continue;
        }
        throw contentError(`already in the B-roll library${duplicate.asset_id ? ` as ${duplicate.asset_id}` : ''} (${duplicate.file})`);
      }
      const assetId = nextAssetId(baseMap, localMap.assets);
      const target = freePath(path.join(stockDir, 'inbox', jobFolder), safeFileName(name));
      await verifiedCopy(file, target, sha256);
      const relative = path.relative(stockDir, target).split(path.sep).join('/');
      localMap.assets[assetId] = relative;
      if (!approvals.includes(assetId)) approvals.push(assetId);
      writeJson(mapFile, localMap);
      writeJson(approvalsFile, approvals);
      const entry = { asset_id: assetId, file: relative, original_name: name, sha256, bytes: size, ...info,
        source: 'envato-inbox', job: jobId, approved_at: new Date().toISOString(), approved_by: approvedBy };
      fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
      log.push(entry);
      moveAside(file, path.join(inboxDir, 'imported'));
      report.imported.push({ file: name, asset_id: assetId, path: relative, duration_seconds: info.duration_seconds });
    } catch (error) {
      const reason = String(error.message || error);
      if (!error.content) { report.deferred.push({ file: name, reason }); continue; }
      try { moveAside(file, path.join(inboxDir, 'rejected'), `Not imported: ${reason}`); } catch { /* leave it in place; still reported */ }
      report.rejected.push({ file: name, reason });
    }
  }
  return report;
}

module.exports = { importInbox, checkVideoHeader, probeClip, nextAssetId, findDuplicate, pendingClips, MIN_CLIP_SECONDS };
