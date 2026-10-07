const crypto = require('crypto');

// FFmpeg xfade effects available to the factory. Pixelize and the four
// corner-wipe effects are intentionally excluded.
const TRANSITION_EFFECTS = Object.freeze([
  'cut', 'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circlecrop', 'rectcrop', 'distance', 'fadeblack', 'fadewhite',
  'radial', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
  'circleopen', 'circleclose', 'vertopen', 'vertclose',
  'horzopen', 'horzclose', 'dissolve',
  'diagtl', 'diagtr', 'diagbl', 'diagbr',
  'hlslice', 'hrslice', 'vuslice', 'vdslice', 'hblur', 'fadegrays',
  'squeezeh', 'squeezev', 'zoomin', 'fadefast', 'fadeslow',
  'hlwind', 'hrwind', 'vuwind', 'vdwind',
  'coverleft', 'coverright', 'coverup', 'coverdown',
  'revealleft', 'revealright', 'revealup', 'revealdown',
]);

function chooseRandomTransition(previous = null) {
  const choices = TRANSITION_EFFECTS.filter(effect => effect !== previous);
  return choices[crypto.randomInt(choices.length)];
}

module.exports = { TRANSITION_EFFECTS, chooseRandomTransition };
