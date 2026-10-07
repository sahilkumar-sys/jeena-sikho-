'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSrtCues, assembleCorrectedSrt, correctionKey, correctCaptionGrammar } = require('./caption-grammar');
const { createShortCueSrt } = require('./video-broll-factory');
const { glossary } = require('./caption-policy');
const { fingerprint } = require('./factory-state');

function sample(count) {
  return `${Array.from({ length: count }, (_, position) => {
    const seconds = String(position).padStart(2, '0');
    return `${position + 1}\n00:00:${seconds},000 --> 00:00:${seconds},800\nतबियत ठीक`;
  }).join('\n\n')}\n`;
}

test('corrects more than one provider chunk while retaining all cue indices and timestamps', async () => {
  const raw = sample(35);
  let calls = 0;
  const corrected = await correctCaptionGrammar(raw, { requestJson: async (_system, user) => {
    calls += 1;
    const requested = JSON.parse(user).cues;
    return { cues: requested.map(cue => ({ index: cue.index, text: 'तबीयत ठीक' })) };
  } });
  assert.equal(calls, 2);
  assert.equal(parseSrtCues(corrected).length, 35);
  assert.ok(parseSrtCues(corrected).every((cue, position) =>
    cue.text === 'तबीयत ठीक' && cue.timing === parseSrtCues(raw)[position].timing));
});

function srt(...texts) {
  return `${texts.map((text, position) => `${position + 1}\n00:00:${String(position).padStart(2, '0')},000 --> 00:00:${String(position).padStart(2, '0')},800\n${text}`).join('\n\n')}\n`;
}

function revise(raw, ...texts) {
  return assembleCorrectedSrt(raw, { cues: texts.map((text, position) => ({ index: position + 1, text })) });
}

test('normalizes punctuation without adding sentence stops to fragments or changing timings', () => {
  const raw = srt('कैसी है तबियत?', 'रोज सुबह', 'आएँ ,फिर', 'क्यों???');
  const corrected = parseSrtCues(revise(raw, 'कैसी है तबीयत ???', 'रोज़ सुबह', 'आएँ ,फिर', 'क्यों???'));
  assert.deepEqual(corrected.map(cue => cue.text), ['कैसी है तबीयत?', 'रोज़ सुबह', 'आएँ, फिर', 'क्यों?']);
  assert.deepEqual(corrected.map(cue => cue.timing), parseSrtCues(raw).map(cue => cue.timing));
});

test('canonical product spellings work across cue boundaries without changing unrelated Ma or Pa', async () => {
  const raw = srt('Dr.', 'Pa,', 'Ma Kit महिलाओं', 'Pa बोले');
  const corrected = await correctCaptionGrammar(raw, { requestJson: async (_system, user) => {
    const input = JSON.parse(user);
    assert.equal(input.glossary.version, 1);
    assert.deepEqual(input.cues.map(cue => cue.text), ['Dr.', 'Paa,', 'Maa Kit महिलाओं', 'Pa बोले']);
    return { cues: input.cues.map(({ index, text }) => ({ index, text })) };
  } });
  assert.deepEqual(parseSrtCues(corrected).map(cue => cue.text), ['Dr.', 'Paa,', 'Maa Kit महिलाओं', 'Pa बोले']);
});

test('rejects omitted words, unrelated rewrites, protected name changes and negations', () => {
  for (const [before, after, message] of [
    ['कैसी है तबियत?', 'कीजिए', /added or removed words/],
    ['कैसी है तबियत?', 'गलत दवा अच्छी', /spoken wording/],
    ['Dr. Paa Kit', 'Dr. Maa Kit', /protected name/],
    ['HIIMS अस्पताल', 'HIMMS अस्पताल', /protected name/],
    ['दवा नहीं लें', 'दवा सही लें', /negation/],
    ['do not stop', 'do now stop', /negation/],
  ]) assert.throws(() => revise(srt(before), after), message);
});

test('preserves decimals, signs, ranges and percentages rather than just digit groups', () => {
  for (const [before, after] of [['1.5 mg', '1,5 mg'], ['1.5 mg', '1 5 mg'],
    ['-5 mg', '5 mg'], ['5%', '5'], ['3-5 दिन', '3,5 दिन']]) {
    assert.throws(() => revise(srt(before), after), /changed a number/);
  }
  assert.equal(parseSrtCues(revise(srt('1.5 mg, 3-5 दिन'), '1.5 mg, 3-5 दिन'))[0].text, '1.5 mg, 3-5 दिन');
});

test('allows faithful Hindi matra/nukta and hyphen corrections but rejects unsafe text before cleanup', () => {
  const raw = srt('रोज सुबह जरूर', 'एंटी कैंसर', 'बनाएं गाँठ');
  assert.deepEqual(parseSrtCues(revise(raw, 'रोज़ सुबह ज़रूर', 'एंटी-कैंसर', 'बनाएँ गाँठ')).map(cue => cue.text),
    ['रोज़ सुबह ज़रूर', 'एंटी-कैंसर', 'बनाएँ गाँठ']);
  for (const text of ['तबियत\nठीक', '<b>तबियत ठीक</b>', '{तबियत ठीक}', 'तबियत\\ठीक']) {
    assert.throws(() => revise(srt('तबियत ठीक'), text), /unsafe/);
  }
});

test('uses corrected neighboring cues across provider chunks and retries a wording failure', async () => {
  let calls = 0;
  const corrected = await correctCaptionGrammar(sample(35), { requestJson: async (system, user) => {
    calls += 1;
    const input = JSON.parse(user.split('\nYour previous result')[0]);
    assert.match(system, /boundaries are not sentence boundaries/);
    if (calls === 1) return { cues: input.cues.map(cue => ({ index: cue.index, text: 'गलत दवा' })) };
    if (calls === 2) assert.match(user, /previous result was rejected/);
    if (calls === 3) assert.deepEqual(input.previous, ['तबीयत ठीक', 'तबीयत ठीक', 'तबीयत ठीक']);
    return { cues: input.cues.map(cue => ({ index: cue.index, text: 'तबीयत ठीक' })) };
  } });
  assert.equal(calls, 3);
  assert.equal(parseSrtCues(corrected).length, 35);
});

test('glossary edits invalidate the caption cache', () => {
  const originalKey = correctionKey(sample(1), 'openai', 'model', 'url');
  glossary.version += 1;
  try { assert.notEqual(correctionKey(sample(1), 'openai', 'model', 'url'), originalKey); }
  finally { glossary.version -= 1; }
});

function transcript(...texts) {
  return { words: texts.map((text, index) => ({ type: 'word', text, start: index * 0.3, end: index * 0.3 + 0.2 })) };
}

test('keeps titles with names within the cue word limit and original word timestamps', () => {
  for (const limit of [2, 3]) {
    const input = transcript('ये', 'हैं', 'Dr.', 'Pa', 'Kit', 'और', 'डॉ.', 'Maa', 'Kit।');
    const cues = parseSrtCues(createShortCueSrt(input, limit));
    assert.ok(cues.every(cue => !/^(Dr\.|डॉ\.)$/u.test(cue.text)));
    assert.ok(cues.every(cue => cue.text.split(' ').length <= limit));
    assert.deepEqual(cues.flatMap(cue => cue.text.split(' ')), input.words.map(word => word.text));
    assert.ok(cues.some(cue => cue.text.startsWith('Dr. Pa') && cue.timing.startsWith('00:00:00,600')));
  }
});

test('still splits true sentence ends, quoted sentence ends and long speech pauses', () => {
  const input = transcript('ठीक।', 'हाँ?', 'रुकिए!"', 'फिर', 'आएँ');
  input.words[4].start = 3;
  input.words[4].end = 3.2;
  assert.deepEqual(parseSrtCues(createShortCueSrt(input)).map(cue => cue.text), ['ठीक।', 'हाँ?', 'रुकिए!"', 'फिर', 'आएँ']);
});

test('rejects changed numbers or missing cues after retry', async () => {
  let calls = 0;
  await assert.rejects(correctCaptionGrammar('1\n00:00:00,000 --> 00:00:00,800\n123 रुपये\n', {
    requestJson: async () => { calls += 1; return { cues: [{ index: 1, text: '456 रुपये' }] }; },
  }), /changed a number/);
  assert.equal(calls, 2);
  await assert.rejects(correctCaptionGrammar(sample(2), {
    requestJson: async () => ({ cues: [{ index: 1, text: 'सही शब्द' }] }),
  }), /exactly 2 cues/);
});

test('cache key changes with model and provider', () => {
  const raw = sample(1);
  assert.notEqual(correctionKey(raw, 'gemini', 'one', 'url'), correctionKey(raw, 'gemini', 'two', 'url'));
  assert.notEqual(correctionKey(raw, 'gemini', 'one', 'url'), correctionKey(raw, 'openai', 'one', 'url'));
  assert.notEqual(correctionKey(raw, 'openai', 'one', 'url'),
    fingerprint({ version: 2, rawSrt: raw, provider: 'openai', model: 'one', url: 'url' }));
});
