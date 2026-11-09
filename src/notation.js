// notation.js — turns cube notation like R' into plain English.
const FACE_WORD = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back', M: 'middle slice (like L)', E: 'equator slice (like D)', S: 'standing slice (like F)' };
export function explainMove(m) {
  const base = m[0], mod = m.slice(1);
  const how = mod === '2' ? 'twice (half turn)' : mod === "'" ? 'anticlockwise' : 'clockwise';
  if ('xyz'.includes(base)) {
    const like = { x: 'R', y: 'U', z: 'F' }[base];
    return `${m}: rotate the whole cube ${mod === '2' ? 'twice' : mod === "'" ? 'backwards' : ''} the way ${like} turns. No layer moves, you're just changing your grip.`.replace('  ', ' ');
  }
  if (base === base.toLowerCase()) return `${m}: turn the ${FACE_WORD[base.toUpperCase()]} two layers together ${how}.`;
  return `${m}: turn the ${FACE_WORD[base]} ${base === 'M' || base === 'E' || base === 'S' ? '' : 'face '}${how}, as if you're looking straight at it.`;
}

