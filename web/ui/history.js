import {el,row,card,button,badge,external,fmtDate,languages} from './dom.js';
import {exportHistory,importHistory} from '../core/store.js';
import * as db from '../core/db.js';
import {toast} from '../core/bus.js';
export function historyActions(after=()=>{}){
  const file=el('input');file.type='file';file.accept='.json,.jsonl';file.hidden=true;
  file.onchange=async()=>{try{if(file.files[0]){await importHistory(file.files[0]);toast('Đã nhập lịch sử');await after();}}catch(e){toast(e.message)}finally{file.value='';}};
  return row(button('Xuất',exportHistory),button('Nhập',()=>file.click()),file);
}
export async function historyPage(root){
  const list=el('div','stack'),counts=row();root.append(el('h1','','Lịch sử'),row(counts,historyActions(draw)),list);
  async function draw(){
    const items=(await db.all('history')).sort((a,b)=>b.finished_at.localeCompare(a.finished_at));
    counts.replaceChildren(...Object.keys(languages).map(l=>row(badge(l),String(items.filter(e=>e.lang===l).length))));
    list.replaceChildren(...items.map(e=>card(row(badge(e.lang),el('time','muted',fmtDate(e.finished_at))),el('h2','',external(e.url,e.title)),el('p','muted',e.title_tr))));
    if(!items.length)list.append(card('Chưa có bài đã đọc.'));
  }
  await draw();
}
