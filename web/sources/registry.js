import {refresh as rss} from './rss.js';
import {refresh as wiki} from './wikipedia.js';
import {refresh as series} from './wikisource.js';
import {refresh as aozora} from './aozora.js';
export const adapters={rss,wikipedia:wiki,wikipedia_featured:wiki,wikisource_series:series,aozora};
export async function sources(){const r=await fetch(new URL('../sources.json',import.meta.url));if(!r.ok)throw Error('Không đọc được danh sách nguồn');return r.json();}
