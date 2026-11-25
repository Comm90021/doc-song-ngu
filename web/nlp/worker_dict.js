import {gunzipSync,unzipSync} from '../vendor/fflate/browser.js';
import {parsePack,replacePack} from '../core/dicts.js';
self.onmessage=async({data:{p,buffer}})=>{
  try{
    self.postMessage({phase:'Đang giải nén',pct:0});let bytes=new Uint8Array(buffer);
    if(p.compressed==='gzip')bytes=gunzipSync(bytes);
    if(p.compressed==='zip'){
      const files=unzipSync(bytes), names=Object.keys(files);
      const key=names.find(k=>k===p.zip_entry||k.endsWith('/'+p.zip_entry))||names.find(k=>p.format==='jmdict_simplified'&&/\.json$/i.test(k));
      if(!key)throw Error('Không tìm thấy tệp dữ liệu trong ZIP');bytes=files[key];
    }
    self.postMessage({phase:'Đang phân tích',pct:0});
    const entries=[...parsePack(p,new TextDecoder().decode(bytes))];
    if(!entries.length)throw Error('Gói từ điển không có mục từ');
    const meta={id:p.id,lang:p.lang,name:p.name,entries:entries.length,bytes:buffer.byteLength,installed_at:new Date().toISOString(),gloss_lang:p.gloss_lang,license:p.license,source:p.homepage};
    await replacePack(p.id,entries,meta,pct=>self.postMessage({phase:'Đang lưu',pct}));
    self.postMessage({done:true});
  }catch(e){self.postMessage({error:e.message});}
};
