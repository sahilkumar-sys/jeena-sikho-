// Optional local vector shortlist. When the host-side encoder is unavailable the
// factory falls back to a keyword shortlist (local-media-catalog.js) and says so.

// Speech-led search windows: break at sentence/clause ends or audible pauses,
// then merge tiny fragments so every spoken idea gets its own query.
const MIN_PHRASE_SECONDS = 1.8;
const MAX_PHRASE_SECONDS = 7;
const MIN_TAIL_SECONDS = 1; // only a true fragment is merged into the previous phrase
const MAX_QUERIES = 60; // vector-retrieval-service.py accepts at most 60.
// Below this blended rank score a clip is not offered as a match at all.
// Calibrated 2026-10-07 on the 1 fps project index: 17 true matches scored 0.217-0.412,
// 11 no-match queries topped out at 0.163. Override with BROLL_MIN_MATCH_SCORE.
const DEFAULT_MIN_MATCH_SCORE = 0.18;
const ASSET_ID = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

function wordEnd(word) { return Number(word.end ?? word.start); }
function phraseBreak(word, next) {
  const token = String(word.text || '').trim();
  const pause = next ? Number(next.start) - wordEnd(word) : Infinity;
  return /[।!?]$/.test(token) || (/[.,;:]$/.test(token) && token.length > 3) || pause >= 0.35;
}
function queriesFromWords(words, duration) {
  const clean = (words || []).filter(w => Number.isFinite(Number(w.start)) && String(w.text || '').trim() && Number(w.start) < duration);
  const phrases = [];
  let current = [];
  for (let i = 0; i < clean.length; i++) {
    current.push(clean[i]);
    const next = clean[i + 1];
    const span = wordEnd(clean[i]) - Number(current[0].start);
    const wouldBe = next ? wordEnd(next) - Number(current[0].start) : 0;
    if (!next || (phraseBreak(clean[i], next) && span >= MIN_PHRASE_SECONDS) || wouldBe > MAX_PHRASE_SECONDS) {
      phrases.push(current);
      current = [];
    }
  }
  // A short trailing fragment belongs with the previous phrase.
  if (phrases.length > 1) {
    const last = phrases[phrases.length - 1];
    if (wordEnd(last[last.length - 1]) - Number(last[0].start) < MIN_TAIL_SECONDS) phrases[phrases.length - 2].push(...phrases.pop());
  }
  return phrases.slice(0, MAX_QUERIES).map(group => ({
    at: Number(Number(group[0].start).toFixed(1)),
    end: Number(wordEnd(group[group.length - 1]).toFixed(1)),
    text: group.slice(0, 30).map(w => String(w.text).trim()).join(' '),
  }));
}
function minMatchScore() {
  const value = Number(process.env.BROLL_MIN_MATCH_SCORE);
  return process.env.BROLL_MIN_MATCH_SCORE && Number.isFinite(value) ? value : DEFAULT_MIN_MATCH_SCORE;
}
// Shared by the vector and keyword paths so the planner sees one format.
function formatShortlist(results, source) {
  const ids = new Set(), lines = [];
  let weakWindows = 0;
  for (const row of results) {
    const valid = (row.candidates || []).filter(c => ASSET_ID.test(c.id) && typeof c.title === 'string').slice(0, 5);
    if (!valid.length) weakWindows += 1;
    for (const c of valid) ids.add(c.id);
    const span = row.end !== undefined ? `${row.at}-${row.end}s` : `${row.at}s`;
    lines.push(`${span}: ${valid.map(c => `${c.id} ${c.title}${c.in_point_seconds !== undefined ? ` [suggested in-point ${Number(c.in_point_seconds || 0).toFixed(1)}s]` : ''}`).join(' | ')
      || 'NO GOOD VIDEO MATCH - keep the presenter on screen or use a permitted still'}`);
  }
  return { ids, hints: lines.join('\n'), query_count: results.length, weak_windows: weakWindows, source };
}
async function available(url = process.env.BROLL_RETRIEVAL_URL || 'http://host.docker.internal:8766/search') {
  try {
    const health = new URL(url); health.pathname = '/health';
    const response = await fetch(health, { signal: AbortSignal.timeout(1000) });
    return response.ok && Boolean((await response.json()).ready);
  } catch { return false; }
}
async function shortlistQueries(queries, url = process.env.BROLL_RETRIEVAL_URL || 'http://host.docker.internal:8766/search') {
  if (!queries.length) return null;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries: queries.map(({ at, text }) => ({ at, text })), top_k: 5 }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length !== queries.length) throw Error('invalid response');
    const floor = minMatchScore();
    return formatShortlist(data.results.map((row, i) => ({ ...row, end: queries[i].end,
      candidates: (row.candidates || []).filter(c => !Number.isFinite(c.rank_score) || c.rank_score >= floor) })), 'vector');
  } catch (error) {
    process.stdout.write(`BROLL_VECTOR_FALLBACK=${String(error.message || error).slice(0, 120)}\n`);
    return null;
  }
}
async function shortlist(words, duration, url) { return shortlistQueries(queriesFromWords(words, duration), url); }
// Fit check: score the exact seconds each planned shot shows (see broll-fit-check.js).
async function verifyShots(shots, excludeIds = [], url = process.env.BROLL_RETRIEVAL_URL || 'http://host.docker.internal:8766/search') {
  const endpoint = new URL(url); endpoint.pathname = '/verify';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shots, exclude_ids: [...excludeIds], top_k: 5 }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`fit check HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.results) || data.results.length !== shots.length) throw Error('invalid fit check response');
  return data.results;
}
module.exports = { queriesFromWords, available, shortlistQueries, shortlist, formatShortlist, minMatchScore, verifyShots, DEFAULT_MIN_MATCH_SCORE };
