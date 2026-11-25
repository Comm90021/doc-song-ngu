import {candidate} from './candidate.js';
function csv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&ch===','){row.push(field);field='';}
    else if(!quoted&&ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(row.length || field)rows.push([...row,field]);
  return rows;
}
export async function refresh(s,ctx){
  let catalog=await ctx.db.state('aozora_catalog');
  const stamp=await ctx.db.state('aozora_catalog_at');
  if(!catalog || Date.parse(ctx.now)-Date.parse(stamp)>30*86400000){
    const res=await ctx.net.fetchBytes('https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip');
    if(res.status!==200)throw Error('Không tải được danh mục Aozora');
    const {unzipSync}=ctx.fflate||await import('../vendor/fflate/browser.js');
    const files=unzipSync(res.bytes), key=Object.keys(files).find(k=>/\.csv$/i.test(k));
    const [head,...rows]=csv(new TextDecoder().decode(files[key]));
    catalog=[];
    for(const row of rows){
      const col=k=>row[head.indexOf(k)]||'';
      const ndc=col('分類番号'),url=col('XHTML/HTMLファイルURL')||col('XHTMLファイルURL');
      if(url&&col('文字遣い種別')==='新字新仮名'&&col('役割フラグ')==='著者'&&col('作品著作権フラグ')==='なし'){
        catalog.push({url,ndc,title:col('作品名')+' — '+col('姓')+col('名')});
      }
    }
    await ctx.db.setState('aozora_catalog',catalog);await ctx.db.setState('aozora_catalog_at',ctx.now);
  }
  const existing=new Set((await ctx.db.index('candidates','source_id',s.id)).map(c=>c.url));
  const rows=catalog.filter(r=>!existing.has(r.url)&&r.ndc.match(/\d+/g)?.some(n=>s.ndc.some(prefix=>n.startsWith(prefix))));
  const out=[];
  while(rows.length && out.length<(s.per_refresh||10)){
    const i=Math.floor(Math.random()*rows.length),r=rows[i];rows[i]=rows[rows.length-1];rows.pop();
    out.push(candidate(s,ctx,r.url,r.title,{topics:[/\b2\d\d/.test(r.ndc)?'history':'literature']}));
  }
  return out;
}
