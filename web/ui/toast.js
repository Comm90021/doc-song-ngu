import {bus} from '../core/bus.js';
export function initToast(){
  let timer;const node=document.querySelector('#notice');
  bus.addEventListener('toast',({detail})=>{node.textContent=detail.text;node.hidden=false;clearTimeout(timer);timer=setTimeout(()=>node.hidden=true,4200);});
}
