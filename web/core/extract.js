import * as network from './net.js';
import {detectLang} from './langdetect.js';
const skip=new Set('References|Notes|See also|External links|Further reading|Bibliography|Sources|Citations|Footnotes|脚注|注釈|出典|参考文献|関連項目|外部リンク|参照|参考资料|參考資料|參考文獻|注释|注釋|外部链接|外部連結|参见|參見|腳註|延伸阅读|延伸閱讀|각주|참고 문헌|같이 보기|외부 링크|참조|더 읽어보기'.split('|'));
const boiler=new Set(['Advertisement','Share','Read more','広告','关注我们','광고','기자','©']);
export function wikiAPI(host,params){return 'https://'+host+'/w/api.php?'+new URLSearchParams({...params,format:'json',formatversion:'2',origin:'*'});}
export async function extractArticle(url,{lang,net=network,DOMParser=globalThis.DOMParser,Readability=globalThis.Readability}={}){
  const uri=new URL(url),parse=html=>new DOMParser().parseFromString(html,'text/html');
  const blocks=[];
  let title='',hint='',finalUrl=url,author;
  function add(type,raw){
    const text=raw.replace(/\s+/gu,' ').trim();
    if(text&&!boiler.has(text))blocks.push({type,text});
  }
  function walk(root,selector,min=0){
    const nodes=[...root.querySelectorAll(selector)];
    for(const n of nodes){
      if(n.querySelector(selector))continue;
      if(n.textContent.trim().length>=min)add(/^H[1-4]$/.test(n.tagName)?'h':'p',n.textContent);
    }
  }
  const page=decodeURIComponent(uri.pathname.slice(6)).replace(/_/g,' ');
  if(uri.pathname.startsWith('/wiki/') && uri.hostname.endsWith('.wikipedia.org')){
    const json=await net.fetchJSON(wikiAPI(uri.host,{action:'query',prop:'extracts',explaintext:1,exsectionformat:'wiki',redirects:1,titles:page}),{direct:true});
    const article=json.query.pages[0];title=article.title;let depth=0;
    for(const line of (article.extract||'').split('\n')){
      const h=/^(=+)\s*(.*?)\s*\1$/.exec(line.trim());
      if(h && (!depth || h[1].length<=depth)) depth=skip.has(h[2])?h[1].length:0;
      if(!depth)add(h?'h':'p',h?h[2]:line);
    }
  }else if(uri.pathname.startsWith('/wiki/') && uri.hostname.endsWith('.wikisource.org')){
    const {parse:p}=await net.fetchJSON(wikiAPI(uri.host,{action:'parse',page,prop:'text'}),{direct:true});
    title=p.title;const doc=parse(p.text);
    doc.querySelectorAll('.ws-noexport,#headerContainer,.headertemplate,.mw-editsection,sup.reference,ol.references,table,style,script').forEach(n=>n.remove());
    for(const br of doc.querySelectorAll('br'))br.replaceWith('\n');
    const root=doc.querySelector('.mw-parser-output')||doc;
    for(const poem of root.querySelectorAll('div.poem')){
      const fragment=doc.createDocumentFragment();
      for(const line of poem.textContent.split('\n')){const p=doc.createElement('p');p.textContent=line;fragment.append(p);}
      poem.replaceWith(fragment);
    }
    walk(root,'h2,h3,h4,p,dd,li');
  }else{
    const aozora=uri.hostname.endsWith('aozora.gr.jp');
    const res=await net.fetchText(url,aozora?{fallback:'shift_jis'}:{});
    finalUrl=res.finalUrl||url;
    const doc=parse(res.text);hint=doc.documentElement.lang;
    if(aozora && doc.querySelector('.main_text')){
      title=doc.querySelector('h1.title')?.textContent;author=doc.querySelector('.author')?.textContent;
      const root=doc.querySelector('.main_text');
      root.querySelectorAll('rt,rp,.notes,script,style').forEach(n=>n.remove());
      let pending='';
      function flush(){for(const line of pending.split('\n'))add('p',line);pending='';}
      function visit(n){
        if(n.nodeType===3){pending+=n.data;return}
        if(n.nodeType!==1)return;
        if(n.matches('.o-midashi,.naka-midashi,.ko-midashi')){flush();add('h',n.textContent);return}
        if(n.matches('br,p,div'))flush();
        for(const child of n.childNodes)visit(child);
        if(n.matches('p,div'))flush();
      }
      visit(root);flush();
    }else{
      doc.querySelectorAll('figure,figcaption,aside,nav,table,form,button,script,style').forEach(n=>n.remove());
      const a=Readability && new Readability(doc.cloneNode(true)).parse();
      title=(a?.title||doc.querySelector('meta[property="og:title"]')?.content||doc.title).replace(/\s(?:-|–|\|)\s.{1,20}$/u,'');
      if(a?.textContent?.trim().length>=300)walk(parse(a.content),'h1,h2,h3,h4,p,li,blockquote');
      else walk(doc,'p,h2,h3,li',40);
    }
  }
  if(!blocks.length)throw Error('Không tìm thấy nội dung bài');
  return {url,finalUrl,title:title?.trim()||uri.hostname,lang:lang||detectLang(blocks.map(b=>b.text).join(' '),hint),blocks,...(author&&{author})};
}
