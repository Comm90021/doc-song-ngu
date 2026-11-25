const abbreviations = new Set('mr mrs ms dr prof sr jr st mt gen gov sen rep lt col capt inc ltd co corp vs etc e.g i.e no jan feb mar apr may jun jul aug sep sept oct nov dec u.s u.k u.n e.u a.m p.m'.split(' '));
export function splitSentences(text, lang) {
  const east = ['ja','zh'].includes(lang);
  const out = [];
  function add(value) {
    value = value.trim();
    if (!value) return;
    if (east && value.length < 2 && out.length) out[out.length - 1] += value;
    else out.push(value);
  }
  for (const line of east ? text.split(/\r?\n/) : [text]) {
    let start = 0;
    const ends = east ? /[。！？!?…]+[」』）】〉》"'”’]*/gu : /[.!?…]+["'”’)\]}]*(?=\s+[\p{Lu}\d"'“‘가-힣])/gu;
    for (const match of line.matchAll(ends)) {
      const end = match.index + match[0].length;
      if (lang==='en' && /^\s+[가-힣]/u.test(line.slice(end))) continue;
      if (!east && match[0].startsWith('.')) {
        const last = line.slice(start, match.index).match(/[A-Za-z.]+$/)?.[0] || '';
        if (abbreviations.has(last.toLowerCase()) || /^[A-Z]$/.test(last)) continue;
      }
      add(line.slice(start, end));
      start = end;
    }
    add(line.slice(start));
  }
  return out;
}
