export const labels = {n:'danh từ', v:'động từ', a:'tính từ–trạng từ', p:'hư từ', x:'khác'};
export function posMap(groups) {
  return Object.fromEntries(Object.entries(groups).flatMap(([key, list]) => list.split(' ').map(tag => [tag,key])));
}
