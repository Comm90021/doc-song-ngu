import {el,button,row} from './dom.js';
import {lookupWord} from '../core/lookup.js';
import {labels} from '../nlp/pos.js';
import {settings} from '../core/settings.js';
let active;
export function closePopup(){if(!active)return false;active.word.classList.remove('selected');active.node.remove();active=null;return true;}
export function attachLookup({body,records,lang},signal){
  let start,lastScroll=-Infinity,openY=0;
  window.addEventListener('scroll',()=>{lastScroll=performance.now();if(active&&Math.abs(window.scrollY-openY)>30)closePopup();},{passive:true,signal});
  document.addEventListener('pointerdown',e=>{if(active&&!active.node.contains(e.target)&&!active.word.contains(e.target))closePopup();},{signal});
  body.addEventListener('pointerdown',e=>{start={word:e.target.closest('.w'),x:e.clientX,y:e.clientY,time:performance.now(),id:e.pointerId};},{signal});
  body.addEventListener('pointercancel',()=>start=null,{signal});
  body.addEventListener('pointerup',async e=>{
    const down=start;start=null;const word=e.target.closest('.w');
    if(!word||down?.word!==word||down.id!==e.pointerId||performance.now()-down.time>500||performance.now()-lastScroll<250||Math.hypot(e.clientX-down.x,e.clientY-down.y)>=8)return;
    const s=await settings();if(!s.lookup||signal.aborted)return;
    closePopup();
    const sentence=records.get(+word.closest('.sentence').dataset.i),w=+word.dataset.w,info=sentence.words[w];
    const surface=sentence.tokens.filter(t=>t.w===w).map(t=>t.s).join('');
    const content=el('div'),node=el('aside','popup',row(el('strong','popup-title',surface),button('✕',closePopup)),content);node.setAttribute('role','dialog');node.setAttribute('aria-label','Tra từ');document.body.append(node);word.classList.add('selected');active={node,word};openY=scrollY;
    function position(){
      if(innerWidth<700)return;
      const r=word.getBoundingClientRect(),p=node.getBoundingClientRect();
      node.style.left=Math.max(8,Math.min(r.left,innerWidth-p.width-8))+'px';
      node.style.top=Math.max(8,r.bottom+p.height+8<innerHeight?r.bottom+5:Math.min(innerHeight-p.height-8,r.top-p.height-5))+'px';
    }
    content.append('Đang tra…');position();
    try{
      const {entries,quick}=await lookupWord({lang,surface,...info},{settings:s});
      if(active?.node!==node)return;
      const reading=info.reading||entries[0]?.reading;
      content.replaceChildren(el('p','muted',[reading,info.lemma!==surface?info.lemma:'',labels[info.pos]].filter(Boolean).join(' · ')));
      for(const entry of entries)content.append(el('strong','',entry.head+' · '+(entry.gloss_lang==='vi'?'Việt':'Anh')),el('ul','',...entry.senses.map(x=>el('li','',x))));
      if(quick?.tr)content.append(el('p','','Dịch nhanh: '+quick.tr));
      if(!entries.length&&!quick?.tr)content.append(el('p','muted','Chưa có nghĩa cho từ này.'));
      for(const name of new Set(entries.map(x=>x.source+' ('+x.license+')')))content.append(el('small','muted','Nguồn: '+name));
      position();
    }catch(e){content.textContent=e.message;}
  },{signal});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closePopup();},{signal});
  signal.addEventListener('abort',closePopup,{once:true});
}
export async function packList(root,signal){
  const {listPacks,installPack,removePack}=await import('../core/dicts.js');
  const {bus}=await import('../core/bus.js');
  const progress=new Map();
  bus.addEventListener('dict-progress',e=>{const n=progress.get(e.detail.id);if(n)n.textContent=e.detail.phase+' · '+e.detail.pct+'%';},{signal});
  async function draw(){
    const packs=await listPacks();root.replaceChildren();
    for(const p of packs){
      const status=el('small','muted',p.installed?p.installed.entries.toLocaleString('vi')+' mục từ':'');progress.set(p.id,status);
      const b=button(p.installed?'Gỡ':'Cài',async b=>{b.disabled=true;try{if(p.installed)await removePack(p.id);else await installPack(p);await draw();}finally{b.disabled=false;}});
      root.append(el('div','pack',row(el('strong','',p.name),b),el('div','muted',p.license+' · '+p.size_mb+' MB'),status));
    }
  }
  await draw();
}
