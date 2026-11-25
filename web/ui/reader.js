import {el,button,row,external,percent,fmtDate} from './dom.js';
import * as db from '../core/db.js';
import {settings,set} from '../core/settings.js';
import {finishArticle,abandonArticle} from '../core/recommend.js';
import {openArticle,resumeTranslation,translateOnReaderOpen} from '../core/article.js';
import {needsTranslation} from '../core/translate.js';
import {bus,toast} from '../core/bus.js';
import {sources} from '../sources/registry.js';
export function original(s){
  const line=el('div','original');let word,w;
  for(const t of s.tokens){
    if(t.w===undefined){line.append(t.s);w=undefined;continue;}
    if(w!==t.w){w=t.w;word=el('span','w');word.dataset.w=w;word.dataset.p=s.words[w].pos;line.append(word);}
    word.append(t.r?el('ruby','',t.s,el('rt','',t.r)):t.s);
  }
  return line;
}
export async function reader(root,id,signal){
  let a=await db.get('articles',id);if(a?.status!=='ready'){root.append(el('h1','','Bài không còn trong bộ nhớ'));return;}
  const s=await settings(),c=await db.get('candidates',a.canon);
  if(a.target_lang!==s.target_lang || (a.lang==='zh' && await db.state('zh_script:'+id)!==s.zh_script)){
    root.textContent='Đang phân tích câu…';await openArticle(a.url,c||a);a=await db.get('articles',id);root.replaceChildren();
  }
  let last=a.progress.last_read,timer;
  const progress=el('span','muted'),translated=el('span','muted');
  const retry=button('⚠ Dịch tạm dừng ↻',()=>resumeTranslation(id));
  const toggleKey=(label,key)=>button(label,async b=>{s[key]=!s[key];await set(key,s[key]);b.setAttribute('aria-pressed',s[key]);});
  const lookup=toggleKey('Tra từ','lookup'),ruby=toggleKey('Âm','ruby');lookup.setAttribute('aria-pressed',s.lookup);ruby.setAttribute('aria-pressed',s.ruby);
  // Nhãn ghi rõ chế độ đang dùng (trước đây chỉ ghi "Dịch" nên bấm vào tưởng là bật dịch, thực ra làm mờ/ẩn bản dịch).
  const trLabel=()=>'Dịch: '+({show:'hiện',blur:'mờ',hide:'ẩn'})[s.tr_mode];
  const translation=button(trLabel(),async b=>{s.tr_mode=({show:'blur',blur:'hide',hide:'show'})[s.tr_mode];await set('tr_mode',s.tr_mode);b.textContent=trLabel();});
  const panel=el('div','reader-panel',toggleKey('Tách từ','word_gap'),toggleKey('Màu từ loại','pos_color'),...[-1,1].map(d=>button(d<0?'A−':'A+',async()=>{s.font_scale=Math.max(.8,Math.min(1.6,Math.round((s.font_scale+d*.1)*10)/10));await set('font_scale',s.font_scale);})),external(a.url,'Mở bài gốc ↗'));panel.hidden=true;
  const toolbar=el('div','toolbar',row(button('←',()=>location.hash='/'),el('strong','short-title',a.title.text),progress,
    lookup,ruby,translation,button('⚙',()=>panel.hidden=!panel.hidden),translated,retry),panel);
  const body=el('article','paper');
  body.lang=a.lang==='zh'?(s.zh_script==='hant'?'zh-Hant':s.zh_script==='hans'?'zh-Hans':'zh'):a.lang;
  const trNodes=new Map(), records=new Map();
  function sentence(v){
    records.set(v.i,v);const tr=el('div','translation',v.tr||'');tr.onclick=()=>tr.classList.toggle('revealed');trNodes.set(v.i,tr);
    const node=el('div','sentence',original(v),tr);node.dataset.i=v.i;return node;
  }
  const sourceName=(await sources().catch(()=>[])).find(x=>x.id===a.source_id)?.name || new URL(a.url).hostname;
  body.append(el('header','article-head',sentence(a.title),row(el('span','muted',sourceName+' · '+fmtDate(c?.published_at||a.created_at)),external(a.url,'Bài gốc ↗'))));
  for(const block of a.blocks)body.append(el('section','block '+(block.type==='h'?'heading':''),...block.sentences.map(sentence)));
  const finish=button('✓ Đã đọc xong',async b=>{b.disabled=true;try{await save();await finishArticle(id,{next:false});toast('Đã lưu link vào lịch sử');location.hash='/';}finally{b.disabled=false;}},'primary');
  const footer=el('footer','reader-foot',row(finish,button('Bỏ bài này',async()=>{await abandonArticle(id,{next:false});location.hash='/';})));
  root.append(toolbar,body,footer);
  function updateGate(){
    finish.disabled=last<a.progress.total-1;finish.title=finish.disabled?'Kéo tới câu cuối để hoàn thành':'';
    progress.textContent=percent({...a.progress,last_read:last})+'%';
  }
  function updateTr(article){
    const needed=needsTranslation(article.lang,article.target_lang,s);
    const {translated:count,total,tr_state:state}=article.progress;
    for(const v of [article.title,...article.blocks.flatMap(b=>b.sentences)]){
      const node=trNodes.get(v.i);
      node.hidden=!needed;
      node.textContent=needed?(v.tr||(state==='paused'?'chưa dịch được':'đang dịch…')):'';
    }
    translated.textContent='Dịch '+count+'/'+total;
    translated.hidden=!needed||state!=='running';
    retry.hidden=!needed||state!=='paused';
  }
  function save(){clearTimeout(timer);return db.update('articles',id,current=>{current.progress.last_read=Math.max(current.progress.last_read,last);return current;});}
  updateGate();updateTr(a);
  if(signal.aborted)return;
  if(last>=0)body.querySelector('[data-i="'+last+'"]')?.scrollIntoView();
  const observer=new IntersectionObserver(entries=>{
    for(const e of entries)if(e.intersectionRatio>=.6 || e.boundingClientRect.bottom<0)last=Math.max(last,Number(e.target.dataset.i));
    updateGate();clearTimeout(timer);timer=setTimeout(save,2000);
  },{threshold:[0,.6]});
  body.querySelectorAll('.block .sentence').forEach(n=>observer.observe(n));
  signal.addEventListener('abort',()=>{observer.disconnect();void save();},{once:true});
  document.addEventListener('visibilitychange',save,{signal});window.addEventListener('pagehide',save,{signal});
  bus.addEventListener('article-updated',async e=>{if(e.detail.id===id){const latest=await db.get('articles',id);if(latest)updateTr(latest);}},{signal});
  const latest=await db.get('articles',id);
  if(latest&&!signal.aborted){
    updateTr(latest);
    if(needsTranslation(latest.lang,latest.target_lang,s))void translateOnReaderOpen(id).catch(e=>toast(e.message));
  }
  return {body,records,lang:a.lang};
}
