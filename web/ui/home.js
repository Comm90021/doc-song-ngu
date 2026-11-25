import {el,button,card,row,badge,languages,topics,percent,languageCounts} from './dom.js';
import * as db from '../core/db.js';
import {articleId} from '../core/util.js';
import {eligibleCandidates,getSuggestion,skipSuggestion} from '../core/recommend.js';
import {openArticle} from '../core/article.js';
import {maybeRefresh,refreshProgress} from '../core/jobs.js';
import {settings} from '../core/settings.js';
import {sources} from '../sources/registry.js';
import {bus,toast} from '../core/bus.js';

const categories={all:'Mọi loại',news:'Báo',encyclopedia:'Bách khoa',literature:'Văn học'};
export async function home(root,signal){
  const langChips=row(),kindChips=row(),resume=el('div'),suggestion=card(),status=el('span','muted');
  kindChips.classList.add('kind-chips');
  const loading=el('p','muted'),input=el('input'),sub=el('p','sub');
  const heading=el('h2','','Bài đề xuất');
  suggestion.classList.add('suggestion');
  let version=0,statsVersion=0,list=[],opening=false,current;
  let filter={lang:'all',kind:'all',...await db.state('home_filter')};
  const open=async(url,c)=>{
    opening=true;loading.textContent='Đang lấy bài…';
    try{
      let id=c&&await articleId(c.canon);
      if(!id||(await db.get('articles',id))?.status!=='ready')id=await openArticle(url,c);
      if(!signal.aborted)location.hash='/doc/'+id;
    }finally{opening=false;loading.textContent='';}
  };
  input.type='url';input.placeholder='https://…';input.setAttribute('aria-label','Đường dẫn bài viết');
  const paste=row(input,button('Mở',()=>open(input.value.trim()),'primary'));
  input.onkeydown=e=>{if(e.key==='Enter')paste.querySelector('button').click();};
  if(navigator.clipboard?.readText)paste.append(button('Dán',async()=>{input.value=await navigator.clipboard.readText();}));
  for(const [key,chips,labels] of [['lang',langChips,{all:'Tất cả',...languages}],['kind',kindChips,categories]]){
    for(const [value,label] of Object.entries(labels)){
      const b=button(label,async()=>{
        filter={...filter,[key]:value};
        await db.setState('home_filter',filter);await draw();
      },'chip');
      b.dataset.value=value;chips.append(b);
    }
  }
  root.append(el('div','pagehead',el('h1','','Hôm nay'),el('time','muted',new Intl.DateTimeFormat('vi',{weekday:'long',day:'numeric',month:'long'}).format(new Date()))),
    resume,langChips,kindChips,suggestion,card(el('h2','','Dán link bài muốn đọc'),paste,loading),
    row(status,button('Cập nhật',()=>maybeRefresh(true))));
  function showPreparing(lang){
    current=null;
    suggestion.replaceChildren(heading,row(lang&&lang!=='all'?badge(lang):null,el('p','muted','Đang chuẩn bị bài…')));
  }
  async function updateStats(){
    const ticket=++statsVersion,{running,completed,total}=refreshProgress();
    if(running){
      status.textContent=`Đang cập nhật… (${completed}/${total} nguồn)`;
      return;
    }
    const [stamp,s]=await Promise.all([db.state('last_refresh'),settings()]);
    const {pool}=await eligibleCandidates(s,list);
    if(signal.aborted||ticket!==statsVersion)return;
    const time=stamp?'cập nhật '+new Date(stamp).toLocaleTimeString('vi',{hour:'2-digit',minute:'2-digit'}):'chưa cập nhật';
    status.textContent='Chưa đọc: '+languageCounts(pool)+' · '+time;
  }
  async function draw(){
    const ticket=++version,selected=filter;
    for(const [key,chips] of [['lang',langChips],['kind',kindChips]]){
      for(const b of chips.children)b.setAttribute('aria-pressed',String(b.dataset.value===selected[key]));
    }
    if(!current)showPreparing(selected.lang);
    const [c,cached]=await Promise.all([getSuggestion(selected,{sources:list}),db.all('articles')]);
    if(ticket!==version||signal.aborted)return;
    const a=c&&(await db.index('articles','canon',c.canon))[0];
    if(ticket!==version||signal.aborted)return;
    current=c;
    const partial=cached.filter(a=>a.status==='ready'&&a.progress.last_read>=0).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
    resume.replaceChildren(...(partial?[card(el('h2','','Đang đọc dở'),row(el('strong','',partial.title.text),el('span','muted',percent(partial.progress)+'%'),button('Đọc tiếp',()=>location.hash='/doc/'+partial.id)))]:[]));
    suggestion.replaceChildren(heading);
    if(c){
      sub.textContent=a?.title?.tr||'';
      suggestion.append(row(badge(c.lang),el('strong','',list.find(x=>x.id===c.source_id)?.name||c.source_id),
        ...c.topics.map(t=>el('span','topic',topics[t]||t))),el('h3','headline',c.title),sub,
      el('p','muted','≈ '+Math.ceil(c.est_chars/({ja:250,zh:250,ko:300,en:900}[c.lang]))+' phút · '+c.est_chars.toLocaleString('vi')+' ký tự'),
      row(button('Đọc ngay',()=>open(c.url,c),'primary'),button('Bài khác',async()=>{
        showPreparing(c.lang);await skipSuggestion({suggestion:c,next:false});await draw();
      })));
    }else if(refreshProgress().running)suggestion.append(el('p','muted','Đang cập nhật kho bài…'));
    else suggestion.append(el('p','','Chưa có bài phù hợp — bấm Cập nhật hoặc đổi độ dài trong Cài đặt'));
    await updateStats();
  }
  showPreparing(filter.lang);
  try{list=await sources();}catch(e){toast(e.message);}
  if(signal.aborted)return;
  const run=fn=>{void fn().catch(e=>toast(e.message));};
  bus.addEventListener('refresh-status',e=>{
    run(updateStats);
    if(!e.detail.running)run(draw);
    else if(!current)suggestion.replaceChildren(heading,el('p','muted','Đang cập nhật kho bài…'));
  },{signal});
  bus.addEventListener('suggestion-preparing',e=>{
    if(e.detail.filter.lang===filter.lang&&e.detail.filter.kind===filter.kind)showPreparing(e.detail.lang);
    run(updateStats);
  },{signal});
  bus.addEventListener('article-updated',e=>run(async()=>{
    if(!current)return;
    const a=await db.get('articles',e.detail.id);
    if(a&&a.canon===current?.canon&&!signal.aborted)sub.textContent=a.title?.tr||'';
  }),{signal});
  bus.addEventListener('load-status',e=>{if(opening)loading.textContent=e.detail;},{signal});
  run(updateStats);run(draw);
}
