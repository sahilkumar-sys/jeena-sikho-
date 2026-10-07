// Ten restrained FFmpeg xfade effects, rotated in order for each video.
const TRANSITION_EFFECTS = Object.freeze([
  'fade', 'wipeleft', 'slideright', 'circleopen', 'dissolve',
  'wiperight', 'slideleft', 'circleclose', 'wipeup', 'slidedown',
]);

function transitionForIndex(index) {
  return TRANSITION_EFFECTS[index % TRANSITION_EFFECTS.length];
}

function chooseRandomTransition(previous = null) {
  const index = Math.max(0, TRANSITION_EFFECTS.indexOf(previous));
  return TRANSITION_EFFECTS[(index + 1) % TRANSITION_EFFECTS.length];
}

module.exports = { TRANSITION_EFFECTS, transitionForIndex, chooseRandomTransition };
