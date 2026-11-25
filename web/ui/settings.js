import {el,card,row,button,languages,topics} from './dom.js';
import {settings,set} from '../core/settings.js';
import {sources} from '../sources/registry.js';
import {maybeRefresh} from '../core/jobs.js';
import {ledgerLocation} from '../core/store.js';
import {historyActions} from './history.js';
import * as db from '../core/db.js';
import {bus,toast} from '../core/bus.js';
export async function settingsPage(root,signal){
  const s=await settings();
  function field(label,node){return el('label','field',el('span','',label),node);}
  function change(key,node,read){
    node.onchange=async()=>{try{s[key]=read();await set(key,s[key]);}catch(e){toast(e.message);}};
    return node;
  }
  function select(label,key,values){
    const node=el('select');
    for(const [value,text] of Object.entries(values)){const opt=el('option','',text);opt.value=value;node.append(opt);}
    node.value=s[key];return field(label,change(key,node,()=>node.value));
  }
  function check(label,key,initial=s[key]){
    const node=el('input');node.type='checkbox';node.checked=initial;
    return field(label,change(key,node,()=>node.checked));
  }
  function multi(label,key,values){
    const group=el('fieldset','multi',el('legend','',label));
    for(const [value,name] of Object.entries(values)){
      const input=el('input');input.type='checkbox';input.checked=s[key].includes(value);
      group.append(el('label','choice',change(key,input,()=>input.checked?[...new Set([...s[key],value])]:s[key].filter(x=>x!==value)),name));
    }
    return group;
  }
  function input(label,key,type){
    const node=el('input');node.type=type;node.value=s[key];if(type==='range'){node.min=.8;node.max=1.6;node.step=.1;}
    return field(label,change(key,node,()=>type==='range'?Number(node.value):node.value.trim()));
  }
  const group=(title,...items)=>card(el('h2','',title),...items);
  const packs=el('div','packs'),sourceRows=el('div');
  root.append(el('h1','','Cài đặt'),
    group('Đọc',select('Ngôn ngữ dịch','target_lang',{vi:'Tiếng Việt',en:'English',ja:'日本語','zh-CN':'中文',ko:'한국어',fr:'Français',de:'Deutsch',es:'Español',ru:'Русский',th:'ไทย',id:'Indonesia'}),multi('Ngôn ngữ đọc','langs',languages),multi('Chủ đề','topics',topics),select('Độ dài','length',{short:'Ngắn · ≤ 2.500 ký tự',medium:'Vừa · ≤ 8.000 ký tự',long:'Dài · > 8.000 ký tự',any:'Bất kỳ'})),
    group('Hiển thị',check('Phiên âm','ruby'),check('Latin hóa tiếng Hàn','ko_roman'),select('Chữ Trung','zh_script',{hans:'Giản thể',hant:'Phồn thể',orig:'Giữ nguyên'}),select('Bản dịch','tr_mode',{show:'Hiện',blur:'Mờ',hide:'Ẩn'}),check('Tách từ','word_gap'),check('Màu từ loại','pos_color'),input('Cỡ chữ','font_scale','range')),
    group('Tra từ',check('Bật tra từ','lookup'),select('Dịch nhanh','quick_tr',{auto:'Khi thiếu nghĩa ngoại tuyến',always:'Luôn dịch',off:'Tắt'}),packs),
    group('Bộ dịch',select('Dịch vụ','translator',{google_free:'Google miễn phí',openai_compat:'API kiểu OpenAI'}),input('Base URL','oa_base_url','url'),input('Khóa API','oa_key','password'),input('Model','oa_model','text')),
    group('Nguồn bài',sourceRows,button('Cập nhật ngay',async()=>{await maybeRefresh(true);await drawSources();})),
    group('Dữ liệu',historyActions(),el('p','muted','Sổ lịch sử · '+ledgerLocation()),el('p','muted',(await db.state('documents_copy'))||''),button('Xóa dữ liệu tạm',async()=>{if(!confirm('Xóa bài lưu tạm và kho đề xuất?'))return;
      await db.transaction(['articles','candidates','state'],'readwrite',tx=>{tx.objectStore('articles').clear();tx.objectStore('candidates').clear();tx.objectStore('state').delete('current_suggestion');});toast('Đã xóa dữ liệu tạm');
    })));
  async function drawSources(){
    const list=await sources().catch(()=>[]),status=await db.all('source_status');
    sourceRows.replaceChildren(...list.map(src=>{const st=status.find(x=>x.source_id===src.id);
      return el('div','source',check(src.name,'source:'+src.id,s['source:'+src.id]??src.enabled),el('small','muted',st?.last_error|| (st?.last_ok?new Date(st.last_ok).toLocaleString('vi')+' · '+st.items+' bài':'Chưa cập nhật')));
    }));
  }
  await drawSources();
  return packs;
}
