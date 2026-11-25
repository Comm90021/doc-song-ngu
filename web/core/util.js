export const now = () => new Date().toISOString();
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function articleId(canon) {
  const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(canon));
  return Array.from(new Uint8Array(bytes, 0, 8), b => b.toString(16).padStart(2, '0')).join('');
}
export function httpURL(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw Error('Đường dẫn phải dùng HTTP hoặc HTTPS');
  return url;
}
