import {candidate} from './candidate.js';
import {sleep} from '../core/util.js';

async function* csv(text,signal){
  let row=[],field='',quoted=false,nextYield=65536;
  for(let i=0;i<text.length;i++){
    if(i>=nextYield){await sleep(0);signal?.throwIfAborted();nextYield=i+65536;}
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&ch===','){row.push(field);field='';}
    else if(!quoted&&ch==='\n'){row.push(field.replace(/\r$/,''));yield row;row=[];field='';}
    else field+=ch;
  }
  if(row.length||field)yield [...row,field.replace(/\r$/,'')];
}
export async function refresh(s,ctx){
  const [saved,stamp]=await Promise.all([ctx.db.state('aozora_catalog'),ctx.db.state('aozora_catalog_at')]);
  let catalog=saved;
  if(!catalog||!(Date.parse(ctx.now)-Date.parse(stamp)<30*86400000)){
    const res=await ctx.net.fetchBytes('https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip',{signal:ctx.signal});
    if(res.status!==200)throw Error('Không tải được danh mục Aozora');
    ctx.signal?.throwIfAborted();
    const {unzipSync}=ctx.fflate||await import('../vendor/fflate/browser.js');
    const files=unzipSync(res.bytes),key=Object.keys(files).find(k=>/\.csv$/i.test(k));
    if(!key)throw Error('Không tìm thấy tệp danh mục Aozora');
    const rows=csv(new TextDecoder().decode(files[key]),ctx.signal);
    const {value:head}=await rows.next();
    if(!head)throw Error('Danh mục Aozora trống');
    const columns=new Map(head.map((name,i)=>[name,i]));
    catalog=[];
    for await(const row of rows){
      ctx.signal?.throwIfAborted();
      const col=k=>row[columns.get(k)]||'';
      const ndc=col('分類番号'),url=col('XHTML/HTMLファイルURL')||col('XHTMLファイルURL');
      if(url&&col('文字遣い種別')==='新字新仮名'&&col('役割フラグ')==='著者'&&col('作品著作権フラグ')==='なし'){
        catalog.push({url,ndc,title:col('作品名')+' — '+col('姓')+col('名')});
      }
    }
    ctx.signal?.throwIfAborted();
    await ctx.db.batch('state',[{key:'aozora_catalog',value:catalog},{key:'aozora_catalog_at',value:ctx.now}]);
  }
  const rows=catalog.filter(r=>r.ndc.match(/\d+/g)?.some(n=>s.ndc.some(prefix=>n.startsWith(prefix))));
  for(let i=rows.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [rows[i],rows[j]]=[rows[j],rows[i]];
  }
  return rows.map(r=>candidate(s,ctx,r.url,r.title,{topics:[/\b2\d\d/.test(r.ndc)?'history':'literature']}));
}
