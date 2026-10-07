// Fit variable B-roll lengths to spoken word/phrase endings while keeping
// presenter-only gaps and a near-even presenter/B-roll split.
function spokenWords(transcript) {
  return (transcript.words || []).filter(w => String(w.text || '').trim() && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)));
}
function candidatesFor(shot, next, duration, words, minGap = 2, minShot = 2.5, maxShot = 3) {
  const maxEnd = Math.min(duration - 0.04, shot.start + maxShot, next ? next.start - minGap : duration - 0.04);
  const maxFrames = Math.floor((maxEnd - shot.start) * 25 + 1e-5);
  const minFrames = Math.ceil(minShot * 25);
  if (maxFrames < minFrames) throw Error(`Shot ${shot.number} cannot fit ${minShot}s plus ${minGap}s presenter gap.`);
  const byFrames = new Map();
  const add = (frames, score, ending, reason) => {
    if (frames < minFrames || frames > maxFrames) return;
    const old = byFrames.get(frames);
    if (!old || score > old.score) byFrames.set(frames, { frames, score, ending, reason });
  };
  add(minFrames, -1.5, null, 'minimum visible beat');
  add(maxFrames, -0.7, null, next ? 'presenter gap limit' : 'video end');
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.end < shot.start + minShot - 0.05 || word.end > maxEnd + 0.03) continue;
    const frames = Math.round((word.end - shot.start) * 25);
    const token = String(word.text).trim();
    const nextWord = words[i + 1];
    const pause = nextWord ? Number(nextWord.start) - Number(word.end) : 0;
    const sentenceEnd = /[।!?]$/.test(token);
    const clauseEnd = /[,;:]$/.test(token) || (/\.$/.test(token) && token.length > 3);
    const score = (sentenceEnd ? 5 : clauseEnd ? 2.5 : 0.8)
      + (pause >= 0.32 ? 2 : pause >= 0.16 ? 1 : 0)
      + Math.min(frames / 25, 2.7) * 0.3;
    add(frames, score, token, sentenceEnd ? 'sentence boundary' : clauseEnd ? 'clause boundary' : pause >= 0.16 ? 'spoken pause' : 'word boundary');
  }
  return [...byFrames.values()].sort((a, b) => a.frames - b.frames);
}
function assignSpeechDurations(placements, transcript, duration, options = {}) {
  const words = spokenWords(transcript);
  const targetShare = options.targetShare ?? 0.5;
  const minGap = options.minPresenterGap ?? 2;
  const candidates = placements.map((shot, i) => candidatesFor(shot, placements[i+1], duration, words, minGap, options.minShotDuration ?? 2.5, options.maxShotDuration ?? 3));
  let states = new Map([[0, { score: 0, choices: [] }]]);
  for (const choices of candidates) {
    const nextStates = new Map();
    for (const [total, state] of states) for (const choice of choices) {
      const sum = total + choice.frames;
      const score = state.score + choice.score;
      const prior = nextStates.get(sum);
      if (!prior || score > prior.score) nextStates.set(sum, { score, choices: [...state.choices, choice] });
    }
    states = nextStates;
  }
  const target = Math.round(duration * targetShare * 25);
  const allowable = [...states].filter(([frames]) => frames >= Math.floor(duration * 0.49 * 25) && frames <= Math.ceil(duration * 0.505 * 25));
  const pool = allowable.length ? allowable : [...states];
  pool.sort((a, b) => Math.abs(a[0] - target) - Math.abs(b[0] - target) || b[1].score - a[1].score);
  // Within one video frame of the nearest total, prefer spoken boundaries.
  const nearest = Math.abs(pool[0][0] - target);
  const near = pool.filter(([frames]) => Math.abs(frames - target) <= nearest + 1)
    .sort((a, b) => b[1].score - a[1].score || Math.abs(a[0] - target) - Math.abs(b[0] - target));
  const selected = near[0];
  const updated = placements.map((shot, i) => {
    const choice = selected[1].choices[i];
    const end = shot.start + choice.frames / 25;
    const context = words.filter(w => w.start >= shot.start - 0.15 && w.start < end).map(w => String(w.text).trim()).join(' ');
    return { ...shot, duration: Number((choice.frames / 25).toFixed(3)), spoken_context: context,
      timing_reason: choice.reason, timing_boundary_word: choice.ending, end: Number(end.toFixed(3)) };
  });
  const brollSeconds = selected[0] / 25;
  return { placements: updated, broll_seconds: Number(brollSeconds.toFixed(3)), presenter_seconds: Number((duration - brollSeconds).toFixed(3)),
    broll_share: Number((brollSeconds / duration).toFixed(4)), presenter_share: Number((1 - brollSeconds / duration).toFixed(4)),
    speech_boundaries: updated.filter(p => p.timing_boundary_word).length };
}
module.exports = { assignSpeechDurations };
