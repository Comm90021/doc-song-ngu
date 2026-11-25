import * as db from './db.js';
import {emit} from './bus.js';
export const defaults={target_lang:'vi',langs:['zh','ja','ko','en'],topics:['politics','history','literature','world'],length:'medium',zh_script:'hans',ko_roman:true,ruby:true,tr_mode:'show',lookup:true,quick_tr:'auto',word_gap:false,pos_color:false,font_scale:1,translator:'google_free',oa_base_url:'',oa_key:'',oa_model:''};
export async function settings(){return {...defaults,...Object.fromEntries((await db.all('settings')).map(s=>[s.key,s.value]))};}
export async function set(key,value){await db.put('settings',{key,value});emit('settings-changed',{key,value});}
export function apply(s,body=document.body){
  for(const [cls,on] of Object.entries({'ruby-off':!s.ruby,'ko-roman-off':!s.ko_roman,'tr-blur':s.tr_mode==='blur','tr-hide':s.tr_mode==='hide','word-gap':s.word_gap,'pos-color':s.pos_color})) body.classList.toggle(cls,on);
  body.style.setProperty('--scale',s.font_scale);
}
