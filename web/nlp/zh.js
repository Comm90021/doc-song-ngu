import {posMap} from './pos.js';
const pos = posMap({n:'n nr ns nt nz ng nrt vn t s',v:'v vd vg vi',a:'a ad an ag d b z',p:'p c u uj ul uz ud ug uv y e o'});
export function analyzeZh(text, {tag,pinyin}) {
  const tokens = [], words = [];
  let offset = 0;
  function word(s, label) {
    if (!/[\p{L}\p{N}]/u.test(s)) { tokens.push({s}); return; }
    const w = words.length, readings = [];
    for (const ch of pinyin(s,{type:'all',toneType:'symbol'})) {
      if (ch.isZh && /\p{Script=Han}/u.test(ch.origin)) {
        tokens.push({s:ch.origin,r:ch.pinyin,w});
        readings.push(ch.pinyin);
      } else if (tokens[tokens.length-1]?.w === w && !tokens[tokens.length-1].r) tokens[tokens.length-1].s += ch.origin;
      else tokens.push({s:ch.origin,w});
    }
    words.push({lemma:s,pos:pos[label] || 'x',...(readings.length && {reading:readings.join(' ')})});
  }
  for (const entry of tag(text,true)) {
    const at = text.indexOf(entry.word,offset);
    if (at < 0) continue;
    if (at > offset) word(text.slice(offset,at),'x');
    word(entry.word,entry.tag);
    offset = at+entry.word.length;
  }
  if (offset < text.length) word(text.slice(offset),'x');
  return {words,tokens};
}
