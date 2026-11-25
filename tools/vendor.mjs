import {cp,mkdir,readdir,stat,rename,readFile,writeFile} from 'node:fs/promises';
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
// Khi đóng gói APK, Android tự giải nén các file *.gz trong assets và bỏ đuôi .gz,
// nên kuromoji (tìm "base.dat.gz"…) không thấy từ điển → tiếng Nhật hỏng trên điện thoại.
// Đổi đuôi thành .dat.bin (nội dung vẫn là gzip, kuromoji tự giải nén) và sửa 12 tên file trong kuromoji.js.
const dict=join(root,'web/vendor/kuromoji/dict');
for(const name of await readdir(dict))if(name.endsWith('.dat.gz'))await rename(join(dict,name),join(dict,name.slice(0,-3)+'.bin'));
const lib=join(root,'web/vendor/kuromoji/kuromoji.js');
const code=await readFile(lib,'utf8'),count=(code.match(/\.dat\.gz/g)||[]).length;
if(count!==12)throw Error('kuromoji.js: mong 12 tên file .dat.gz, thấy '+count+' — kiểm lại phiên bản kuromoji');
await writeFile(lib,code.replaceAll('.dat.gz','.dat.bin'));
console.log('kuromoji: đã đổi',count,'tên file từ điển sang .dat.bin');
