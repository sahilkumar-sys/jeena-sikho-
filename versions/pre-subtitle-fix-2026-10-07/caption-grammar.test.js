'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSrtCues, correctionKey, correctCaptionGrammar } = require('./caption-grammar');

function sample(count) {
  return `${Array.from({ length: count }, (_, position) => {
    const seconds = String(position).padStart(2, '0');
    return `${position + 1}\n00:00:${seconds},000 --> 00:00:${seconds},800\nगलत शब्द`;
  }).join('\n\n')}\n`;
}

test('corrects more than one provider chunk while retaining all cue indices and timestamps', async () => {
  const raw = sample(35);
  let calls = 0;
  const corrected = await correctCaptionGrammar(raw, { requestJson: async (_system, user) => {
    calls += 1;
    const requested = JSON.parse(user).cues;
    return { cues: requested.map(cue => ({ index: cue.index, text: 'सही शब्द' })) };
  } });
  assert.equal(calls, 2);
  assert.equal(parseSrtCues(corrected).length, 35);
  assert.ok(parseSrtCues(corrected).every((cue, position) =>
    cue.text === 'सही शब्द' && cue.timing === parseSrtCues(raw)[position].timing));
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
});
