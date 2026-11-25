import {settings,apply} from './core/settings.js';
import {rebuild} from './core/store.js';
import {maybeRefresh} from './core/jobs.js';
import {bus,toast} from './core/bus.js';
import {plugin} from './core/net.js';
import {home} from './ui/home.js';
import {reader} from './ui/reader.js';
import {attachLookup,closePopup,packList} from './ui/popup.js';
import {settingsPage} from './ui/settings.js';
import {historyPage} from './ui/history.js';
import {initToast} from './ui/toast.js';
import {el} from './ui/dom.js';
let controller;
async function route(){
  controller?.abort();controller=new AbortController();
  const signal=controller.signal,root=el('div','page'),path=location.hash.slice(1)||'/';
  document.querySelector('#app').replaceChildren(root);window.scrollTo(0,0);
  document.body.classList.toggle('reading',path.startsWith('/doc/'));
  for(const a of document.querySelectorAll('nav a'))a.toggleAttribute('aria-current',a.hash==='#'+path);
  try{
    if(path.startsWith('/doc/')){const view=await reader(root,path.slice(5),signal);if(view&&!signal.aborted)attachLookup(view,signal);}
    else if(path==='/lich-su')await historyPage(root);
    else if(path==='/cai-dat'){const packs=await settingsPage(root,signal);if(!signal.aborted)await packList(packs,signal);}
    else await home(root,signal);
  }catch(e){if(!signal.aborted)root.append(el('p','card',e.message));}
}
function back(){
  if(closePopup())return;
  const panel=document.querySelector('.reader-panel:not([hidden])');if(panel){panel.hidden=true;return;}
  if(!location.hash||location.hash==='#/')plugin('App')?.exitApp();
  else if(history.length>1)history.back();else location.hash='/';
}
initToast();apply(await settings());bus.addEventListener('settings-changed',async()=>apply(await settings()));
window.addEventListener('hashchange',route);
try{await rebuild();}catch(e){toast(e.message);}
await route();
const refresh=()=>maybeRefresh().catch(e=>toast(e.message));
window.addEventListener('focus',refresh);plugin('App')?.addListener('resume',refresh);plugin('App')?.addListener('backButton',back);
void refresh();
