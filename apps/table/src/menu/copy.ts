export const DEFAULT_MENU_LINES=['朋友相聚，只为好牌时光','娱乐积分 · 不涉及金钱交易']
/** 每次进入菜单取一句，不轮播；刷新可能再次抽到同一句。 */
export function pickMenuLine(lines:readonly string[],random=Math.random):string {const list=lines.length?lines:DEFAULT_MENU_LINES;return list[Math.min(list.length-1,Math.max(0,Math.floor(random()*list.length)))]}
