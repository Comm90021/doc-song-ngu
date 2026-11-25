import {cp,mkdir,readdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const files={
  'kuromoji/build/kuromoji.js':'kuromoji/kuromoji.js','kuromoji/dict':'kuromoji/dict',
  'jieba-wasm/pkg/web/jieba_rs_wasm.js':'jieba/jieba_rs_wasm.js','jieba-wasm/pkg/web/jieba_rs_wasm_bg.wasm':'jieba/jieba_rs_wasm_bg.wasm',
  'pinyin-pro/dist/esm':'pinyin/esm','opencc-js/dist/esm/full.js':'opencc/full.js',
  '@mozilla/readability/Readability.js':'readability/Readability.js','@mozilla/readability/Readability-readerable.js':'readability/Readability-readerable.js',
  'fflate/esm/browser.js':'fflate/browser.js'};
async function size(path){const info=await stat(path);if(info.isFile())return info.size;
  const sizes=await Promise.all((await readdir(path)).map(name=>size(join(path,name))));return sizes.reduce((a,b)=>a+b,0);}
for(const [source,target] of Object.entries(files)){
  const dest=join(root,'web/vendor',target);await mkdir(dirname(dest),{recursive:true});
  await cp(join(root,'node_modules',source),dest,{recursive:true});console.log(target,await size(dest),'bytes');
}
