import {el,button,card,row,badge,languages,topics,percent} from './dom.js';
import * as db from '../core/db.js';
import {articleId} from '../core/util.js';
import {getSuggestion,skipSuggestion} from '../core/recommend.js';
import {openArticle} from '../core/article.js';
import {maybeRefresh} from '../core/jobs.js';
import {sources} from '../sources/registry.js';
import {bus,toast} from '../core/bus.js';
let filter='all';
export async function home(root,signal){
  const chips=row(), resume=el('div'), suggestion=card(),status=el('span','muted'), loading=el('p','muted'),input=el('input');
  let version=0,list=[];
  const open=async(url,c)=>{loading.textContent='Đang lấy bài…';try{const id=await openArticle(url,c);if(!signal.aborted)location.hash='/doc/'+id;}finally{loading.textContent='';}};
  input.type='url';input.placeholder='https://…';input.setAttribute('aria-label','Đường dẫn bài viết');
  const paste=row(input,button('Mở',()=>open(input.value.trim()),'primary'));
  input.onkeydown=e=>{if(e.key==='Enter')paste.querySelector('button').click();};
  if(navigator.clipboard?.readText)paste.append(button('Dán',async()=>{input.value=await navigator.clipboard.readText();}));
  for(const [l,name] of Object.entries({all:'Tất cả',...languages})){
    const b=button(name,async()=>{filter=l;await draw();},'chip');b.dataset.lang=l;chips.append(b);
  }
  root.append(el('div','pagehead',el('h1','','Hôm nay'),el('time','muted',new Intl.DateTimeFormat('vi',{weekday:'long',day:'numeric',month:'long'}).format(new Date()))),resume,chips,suggestion,card(el('h2','','Dán link bài muốn đọc'),paste,loading),row(status,button('Cập nhật',async()=>{await maybeRefresh(true);await draw();})));
  async function draw(){
    const ticket=++version;
    for(const b of chips.children)b.setAttribute('aria-pressed',String(b.dataset.lang===filter));
    const current=await getSuggestion(filter,{sources:list});
    const cached=await db.all('articles');
    if(ticket!==version||signal.aborted)return;
    const partial=cached.filter(a=>a.status==='ready'&&a.progress.last_read>=0).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
    resume.replaceChildren(...(partial?[card(el('h2','','Đang đọc dở'),row(el('strong','',partial.title.text),el('span','muted',percent(partial.progress)+'%'),button('Đọc tiếp',()=>location.hash='/doc/'+partial.id)))]:[]));
    suggestion.classList.add('suggestion');suggestion.replaceChildren(el('h2','','Bài đề xuất'));
    if(current){
      const c=current,a=cached.find(x=>x.canon===c.canon);
    const size=c.est_chars||a?.stats?.chars;
      suggestion.append(row(badge(c.lang),el('strong','',list.find(x=>x.id===c.source_id)?.name||c.source_id),...c.topics.map(t=>el('span','topic',topics[t]||t))),el('h3','headline',c.title),el('p','sub',a?.title?.tr||''),el('p','muted',size?'≈ '+Math.ceil(size/({ja:250,zh:250,ko:300,en:900}[c.lang]))+' phút · '+size.toLocaleString('vi')+' ký tự':'chưa rõ độ dài'),row(button('Đọc ngay',()=>open(c.url,c),'primary'),button('Bài khác',async()=>{await skipSuggestion({sources:list});await draw();})));
    }else suggestion.append(el('p','','Chưa có bài phù hợp — bấm Cập nhật hoặc nới bộ lọc trong Cài đặt'));
    const stamp=await db.state('last_refresh');status.textContent='Kho: '+(await db.all('candidates')).length+' bài · '+(stamp?'cập nhật '+new Date(stamp).toLocaleTimeString('vi',{hour:'2-digit',minute:'2-digit'}):'chưa cập nhật');
  }
  try{list=await sources();}catch(e){toast(e.message);}
  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!signal.aborted)draw().catch(e=>toast(e.message));},100);};
  bus.addEventListener('refresh-status',e=>{if(e.detail.running)status.textContent='Đang cập nhật…';else schedule();},{signal});
  bus.addEventListener('suggestion-changed',schedule,{signal});
  bus.addEventListener('article-updated',schedule,{signal});
  bus.addEventListener('load-status',e=>loading.textContent=e.detail,{signal});
  await draw();
}
