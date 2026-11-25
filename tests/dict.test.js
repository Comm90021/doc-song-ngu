import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePack,replacePack,removePack} from '../web/core/dicts.js';
import {lookupWord} from '../web/core/lookup.js';
test('Dictionary formats, indexed lookup and removal',async()=>{
  for(const [lang,format,file] of [['zh','cedict','cedict.txt'],['ja','jmdict_simplified','jmdict.json'],['ko','tsv','ko.tsv']]){
    const p={lang,format,id:lang,name:'Fixture',license:'Test',gloss_lang:'en',columns:{head:0,alt:1,senses:2},skip_lines:lang==='ko'?1:0,sense_sep:';'};
    const rows=[...parsePack(p,await readFile(new URL('fixtures/'+file,import.meta.url),'utf8'))];
    await replacePack(lang,rows,p);
  }
  const lookup=async(lang,surface,lemma=surface,reading)=> (await lookupWord({lang,surface,lemma,reading},{settings:{quick_tr:'off'}})).entries;
  assert.equal((await lookup('zh','歷史'))[0].reading,'lì shǐ');
  assert.equal((await lookup('ja','学ん','学ぶ'))[0].pos,'v');
  assert.equal((await lookup('ja','變','變','まなぶ'))[0].senses[0],'to learn; to study');
  assert.deepEqual((await lookup('ko','나라는'))[0].senses,['country','nation']);
  assert.equal((await lookup('zh','山水')).length,2);
  await removePack('zh');assert.deepEqual(await lookup('zh','山'),[]);
});
