import {ref} from 'vue'
import {skinPreviewEnabled} from './localTableSkin'
import type {TableSceneRenderProfile} from '../components/table/three/sceneRenderProfile'

export type LocalLighting='original'|'neutral'
export function initialLocalLighting(enabled:boolean,value:unknown):LocalLighting{
 return enabled&&value!=='original'?'neutral':'original'
}
const query=typeof location==='undefined'?new URLSearchParams():new URLSearchParams(location.search)
// 本地默认中性光，显式原光参数保留供回归；正式构建沿用已发布基准。
export const selectedLocalLighting=ref(initialLocalLighting(skinPreviewEnabled,query.get('lighting')))
export function setLocalLighting(value:unknown){
 if(skinPreviewEnabled)selectedLocalLighting.value=initialLocalLighting(true,value)
}
// 只去除光源色偏：强度、方向、曝光、色调映射与相机保持原值，避免同时改变多项变量。
export function localLightingProfile(base:TableSceneRenderProfile,mode:LocalLighting):TableSceneRenderProfile{
 if(mode==='original')return base
 return {...base,hemisphere:{...base.hemisphere,skyColor:0xffffff,groundColor:0x080808},
  keyLight:{...base.keyLight,color:0xffffff},
  areaLights:base.areaLights?.map(light=>({...light,color:0xffffff}))}
}
