importScripts('../vendor/kuromoji/kuromoji.js');
const tokenizer=new Promise((resolve,reject)=>self.kuromoji.builder({dicPath:'../vendor/kuromoji/dict/'}).build((err,tk)=>err?reject(err):resolve(tk)));
self.onmessage=async({data:{id,sentences}})=>{
  try{const [{analyzeJa},tk]=await Promise.all([import('./ja.js'),tokenizer]);self.postMessage({id,result:sentences.map(s=>analyzeJa(s,tk))});}
  catch(e){self.postMessage({id,error:String(e)});}
};
