const onset = 'g kk n d tt r m b pp s ss _ j jj ch k t p h'.split(' ');
const vowels = 'a ae ya yae eo e yeo ye o wa wae oe yo u wo we wi yu eu ui i'.split(' ');
const finals = '_ g kk gs n nj nh d l lg lm lb ls lt lp lh m b bs s ss ng j ch k t p h'.split(' ');
const neutral = c => ({g:'k',kk:'k',gs:'k',lg:'k',d:'t',s:'t',ss:'t',j:'t',ch:'t',h:'t',b:'p',bs:'p',lp:'p',nj:'n',nh:'n',lm:'m',lb:'l',ls:'l',lt:'l',lh:'l',_:'',k:'k'})[c] ?? c;
export function romanize(text) {
  return text.replace(/[가-힣]+/g, run => {
    const parts = [...run].map(c => {
      const n = c.charCodeAt(0)-44032;
      return {i:onset[Math.floor(n/588)],v:vowels[Math.floor(n/28)%21],f:finals[n%28]};
    });
    for (let k=0;k<parts.length-1;k++) {
      const a=parts[k], b=parts[k+1], end=neutral(a.f);
      if (b.i === '_' && a.f !== 'ng') {
        const cluster = {gs:['g','s'],nj:['n','j'],nh:['n','_'],lg:['l','g'],lm:['l','m'],lb:['l','b'],ls:['l','s'],lt:['l','t'],lp:['l','p'],lh:['l','_'],bs:['b','s']}[a.f];
        const moved = cluster?.[1] || a.f;
        b.i = (b.v==='i' && {d:'j',t:'ch'}[moved]) || ({l:'r',h:'_'}[moved]) || moved;
        a.f = cluster?.[0] || '_';
      } else if ((end==='n' && b.i==='r') || (end==='l' && b.i==='n')) {
        a.f='l'; b.i='l';
      } else {
        if (b.i==='r' && ['k','p','m','ng'].includes(end)) b.i='n';
        if (['n','m'].includes(b.i)) a.f=({k:'ng',t:'n',p:'m'})[end] || a.f;
        if (b.i==='h' && ['k','t','p'].includes(end)) {
          b.i=({k:'k',t:'t',p:'p'})[end]; a.f='_';
        } else if (a.f==='h' && ['g','d','b','j'].includes(b.i)) {
          b.i=({g:'k',d:'t',b:'p',j:'ch'})[b.i]; a.f='_';
        } else if (end==='l' && b.i==='r') b.i='l';
      }
    }
    return parts.map(p => (p.i==='_'?'':p.i)+p.v+neutral(p.f)).join('');
  });
}
const particles = '에서는 에게서 으로서 으로써 에서도 까지는 부터는 이라고 에서 에게 한테 께서 으로 처럼 보다 까지 부터 라고 와 과 은 는 이 가 을 를 에 의 로 도 만'.split(' ');
const particleOf=word=>particles.find(p=>word.length>p.length&&word.endsWith(p));
export function* eojeolStems(text){
  for(const word of text.match(/[\p{L}\p{M}\p{N}]+/gu)||[]){
    const p=particleOf(word);
    if(p)yield word.slice(0,-p.length);
  }
}
export function analyzeKo(text,{ko_roman=true,hasWord=()=>false}={}) {
  const tokens=[], words=[];
  function add(s,pos) {
    const reading = romanize(s);
    const w = words.push({lemma:s,pos,...(reading!==s && {reading})})-1;
    tokens.push({s,w,...(ko_roman && reading!==s && {r:reading})});
  }
  for (const [s] of text.matchAll(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu)) {
    if (!/[\p{L}\p{N}]/u.test(s)) {tokens.push({s});continue;}
    const p=particleOf(s);
    const stem=p && s.slice(0,-p.length);
    if (stem && (stem.length>=2 || hasWord(stem))) {add(stem,'n');add(p,'p');}
    else add(s,'x');
  }
  return {tokens,words};
}
