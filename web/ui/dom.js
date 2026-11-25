import {toast} from '../core/bus.js';
import {httpURL} from '../core/util.js';
export function el(tag,cls,...children){
  const node=document.createElement(tag);if(cls)node.className=cls;
  node.append(...children.filter(x=>x!=null));return node;
}
export function button(label,action,cls=''){
  const b=el('button',cls,label);b.type='button';b.onclick=async()=>{try{await action(b)}catch(e){toast(e.message)}};return b;
}
export function external(url,label){const a=el('a','external',label);a.href=httpURL(url).href;a.target='_blank';a.rel='noopener noreferrer';return a;}
export const languages={zh:'中文',ja:'日本語',ko:'한국어',en:'English'};
export const topics={politics:'Chính trị',history:'Lịch sử',literature:'Văn học',world:'Thế giới',society:'Xã hội',culture:'Văn hóa'};
const marks={zh:'中',ja:'日',ko:'한',en:'EN'};
export const badge=l=>el('span','badge '+l,marks[l]||l);
export const languageCounts=items=>Object.entries(marks).map(([lang,label])=>
  label+' '+items.filter(item=>item.lang===lang).length).join(' · ');
export const row=(...items)=>el('div','row',...items);
export const card=(...items)=>el('section','card',...items);
export const fmtDate=value=>value?new Date(value).toLocaleDateString('vi-VN'):'';
export const percent=p=>Math.round(100*(p.last_read+1)/Math.max(1,p.total));
