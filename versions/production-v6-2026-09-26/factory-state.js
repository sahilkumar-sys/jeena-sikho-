'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Rename within the same directory: readers see the old complete file or the new one.
function atomicWrite(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx');
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function writeJson(file, value) { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fingerprint(value) { return hash(JSON.stringify(value)); }

async function fileHash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => {
    finishCell();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === ',') finishCell();
    else if (char === '\r' || char === '\n') {
      finishRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('Malformed CSV: unexpected text outside a quoted cell.');
      cell += char;
    }
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted cell.');
  if (cell !== '' || closed || row.length) finishRow();
  return rows;
}

async function cachedFile(file, entry, key) {
  if (!entry || entry.key !== key || !entry.sha256) return false;
  try { return fs.statSync(file).isFile() && fs.statSync(file).size > 0 && await fileHash(file) === entry.sha256; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function jobDirectoryName(video, jobId) {
  const base = path.basename(video, path.extname(video)).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'video';
  // Never truncate the uniqueness suffix or trust CSV path separators.
  const id = String(jobId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return `${base}-${id || fingerprint(video).slice(0, 20)}`;
}

module.exports = { atomicWrite, writeJson, hash, fingerprint, fileHash, parseCsv, cachedFile, jobDirectoryName };
