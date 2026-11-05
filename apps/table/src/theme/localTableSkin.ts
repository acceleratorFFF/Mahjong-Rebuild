import {ref} from 'vue'
export const LOCAL_SKIN_OPTIONS=[{value:'classic',label:'默认墨玉'},{value:'bamboo-jade',label:'竹影青玉'},{value:'moon-navy',label:'月白藏蓝'},{value:'sakura-plum',label:'紫樱绛木'},{value:'butterfly-gold',label:'暖蝶金木'}] as const
export type LocalTableSkin=typeof LOCAL_SKIN_OPTIONS[number]['value']
export const SKIN_STORAGE_KEY='macheng-local-table-skin-v1'
// 用户已授权五主题发布；偏好仍仅存在本机，不影响房间及规则。
export const skinPreviewEnabled=true
export function resolveLocalSkin(value:unknown):LocalTableSkin{return LOCAL_SKIN_OPTIONS.find(option=>option.value===value)?.value??'classic'}
export function initialLocalSkin(enabled:boolean,requested:string|null,storage?:Pick<Storage,'getItem'>):LocalTableSkin{
 if(!enabled)return 'classic'
 if(requested!==null)return resolveLocalSkin(requested)
 try{return resolveLocalSkin(storage?.getItem(SKIN_STORAGE_KEY))}catch{return 'classic'}
}
const query=typeof location==='undefined'?new URLSearchParams():new URLSearchParams(location.search)
let storage:Storage|undefined
try{storage=typeof localStorage==='undefined'?undefined:localStorage}catch{/* 本机存储禁用不影响牌局。 */}
export const selectedTableSkin=ref(initialLocalSkin(skinPreviewEnabled,query.get('skin'),storage))
export function setLocalTableSkin(value:unknown){
 if(!skinPreviewEnabled)return
 selectedTableSkin.value=resolveLocalSkin(value)
 try{storage?.setItem(SKIN_STORAGE_KEY,selectedTableSkin.value)}catch{/* 仅本次页面生效。 */}
}
export function localSkinBackUrl(skin:LocalTableSkin):string|undefined{
 return skin==='classic'?undefined:`${import.meta.env.BASE_URL}themes/${skin}/v1/tile-back.png`
}
