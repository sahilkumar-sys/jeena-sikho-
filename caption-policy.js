'use strict';

const glossary = require('./caption-glossary.json');
const lexicalPattern = /[\p{L}\p{M}\p{N}]+/gu;
const key = text => text.normalize('NFC').toLowerCase();
const letters = text => key(text).replace(/\p{M}/gu, '');
const protectedTerms = new Set(glossary.protected_terms.map(key));
const negations = new Set(['नहीं', 'नही', 'न', 'ना', 'मत', 'बिना', 'no', 'not', 'never', 'without'].map(letters));

function lexicalTokens(text) {
  return String(text).match(lexicalPattern) || [];
}

function isCaptionAbbreviation(text) {
  return glossary.abbreviations.some(abbreviation => key(abbreviation) === key(text));
}

function endsCaptionSentence(text) {
  return !isCaptionAbbreviation(text) && /[.!?।…]["'”’)]*$/u.test(text);
}

function normalizePunctuation(text) {
  return text.normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ').trim()
    .replace(/\s+([,.;:!?।])/gu, '$1')
    .replace(/([!?।,;])\1+/gu, '$1')
    .replace(/\.{2,}/gu, '…')
    .replace(/([,;:!?।])(?=[\p{L}\p{M}])/gu, '$1 ');
}

// Context can cross a cue boundary: "Dr." / "Pa," is still a product name.
// Standalone "Pa" and "Ma" are not automatically assumed to name a product.
function normalizeCaptionCues(cues) {
  const tokens = cues.flatMap(cue => [...cue.text.matchAll(lexicalPattern)].map(match => ({
    cue: cue.index, start: match.index, end: match.index + match[0].length, text: match[0],
  })));
  const replacements = new Map();
  for (let position = 0; position < tokens.length; position += 1) {
    const token = tokens[position];
    for (const entry of glossary.contextual_spellings) {
      const variants = [entry.canonical, ...entry.aliases].map(key);
      if (!variants.includes(key(token.text))) continue;
      const adjacent = [tokens[position - 1]?.text, tokens[position + 1]?.text].filter(Boolean).map(key);
      if (!entry.adjacent_to.some(word => adjacent.includes(key(word)))) continue;
      const list = replacements.get(token.cue) || [];
      list.push({ ...token, replacement: entry.canonical });
      replacements.set(token.cue, list);
    }
  }
  return cues.map(cue => {
    let text = cue.text;
    for (const edit of (replacements.get(cue.index) || []).reverse()) {
      text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
    }
    return { ...cue, text: normalizePunctuation(text) };
  });
}

function editDistance(left, right) {
  const a = [...left], b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function validateFaithfulText(original, corrected, index) {
  // Preserve separators and signs as well as digit groups: 1.5 must not become 1,5.
  const numbers = text => (text.match(/[+−-]?[\p{N}]+(?:[.,:/-][\p{N}]+)*(?:\s?[%‰])?/gu) || []).join('|');
  if (numbers(original) !== numbers(corrected)) throw new Error(`Caption correction changed a number in cue ${index}.`);
  const before = lexicalTokens(original), after = lexicalTokens(corrected);
  if (before.length !== after.length) throw new Error(`Caption correction added or removed words in cue ${index}.`);
  for (let position = 0; position < before.length; position += 1) {
    const a = key(before[position]), b = key(after[position]);
    if (a === b) continue;
    if (protectedTerms.has(a) || protectedTerms.has(b)) {
      throw new Error(`Caption correction changed a protected name in cue ${index}.`);
    }
    const baseA = letters(a), baseB = letters(b);
    if ((negations.has(baseA) || negations.has(baseB)) && baseA !== baseB) {
      throw new Error(`Caption correction changed a negation in cue ${index}.`);
    }
    // Matra/nukta changes and a single spelling edit in a longer word are allowed.
    // This is deliberately conservative; larger corrections need audio review.
    if (baseA === baseB || (Math.min([...baseA].length, [...baseB].length) >= 4 && editDistance(baseA, baseB) <= 1)) continue;
    throw new Error(`Caption correction changed spoken wording in cue ${index}.`);
  }
}

module.exports = { glossary, isCaptionAbbreviation, endsCaptionSentence, normalizeCaptionCues, validateFaithfulText };
