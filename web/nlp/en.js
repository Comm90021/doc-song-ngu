const particles = new Set('the a an of to in on at by for with from and or but as that which who is are was were be been it this these those not'.split(' '));
export function analyzeEn(text) {
  const tokens = [], words = [];
  let offset = 0;
  for (const m of text.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’\-]*|\p{N}+(?:[.,]\p{N}+)*/gu)) {
    if (m.index > offset) tokens.push({s:text.slice(offset,m.index)});
    const lemma = m[0].toLowerCase();
    tokens.push({s:m[0],w:words.push({lemma,pos:particles.has(lemma)?'p':'x'})-1});
    offset = m.index + m[0].length;
  }
  if (offset < text.length) tokens.push({s:text.slice(offset)});
  return {tokens,words};
}
