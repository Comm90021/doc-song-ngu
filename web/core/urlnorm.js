import {httpURL} from './util.js';
export function canon(value) {
  const url = httpURL(value);
  url.protocol = 'https:';
  url.hash = '';
  url.hostname = url.hostname.replace(/(^|\.)(?:mobile|m)\./, '$1');
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.pathname = url.pathname.split('/').map(part => {
    try { return encodeURIComponent(decodeURIComponent(part)); } catch { return part; }
  }).join('/').replace(/\/+$/, '') || '/';
  return url.href;
}
