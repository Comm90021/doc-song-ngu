import {posMap} from './pos.js';
const pos = posMap({n:'名詞',v:'動詞',a:'形容詞 副詞 連体詞',p:'助詞 助動詞 接続詞'});
const han = /[\p{Script=Han}々〆ヶ]/u;
const hira = text => text.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0)-96));
function align(s, reading, w) {
  if (!reading || !han.test(s)) return [{s,w}];
  const runs = s.match(/[\p{Script=Han}々〆ヶ]+|[^\p{Script=Han}々〆ヶ]+/gu);
  const pattern = runs.map(run => han.test(run) ? '(.+?)' : hira(run).replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&')).join('');
  const match = new RegExp('^'+pattern+'$','u').exec(reading);
  if (!match) return [{s,w,...(!/\d/.test(s) && {r:reading})}];
  let group = 0;
  return runs.map(s => han.test(s) ? {s,w,r:match[++group]} : {s,w});
}
export function analyzeJa(text, tokenizer) {
  const words = [], tokens = [];
  let offset = 0;
  for (const t of tokenizer.tokenize(text)) {
    const s = t.surface_form;
    const at = text.indexOf(s,offset);
    if (at < 0) continue;
    if (at > offset) tokens.push({s:text.slice(offset,at)});
    offset = at+s.length;
    if (t.pos === '記号' || !s.trim()) { tokens.push({s}); continue; }
    const reading = t.reading && t.reading !== '*' && hira(t.reading);
    const w = words.push({lemma:t.basic_form && t.basic_form !== '*' ? t.basic_form : s,pos:pos[t.pos] || 'x',...(reading && {reading})})-1;
    tokens.push(...align(s,reading,w));
  }
  if (offset < text.length) tokens.push({s:text.slice(offset)});
  return {tokens,words};
}
