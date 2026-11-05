<script setup lang="ts">
import {computed,ref} from 'vue'
import {LOCAL_SKIN_OPTIONS,selectedTableSkin,setLocalTableSkin,skinPreviewEnabled,type LocalTableSkin} from './localTableSkin'
const panel=ref<HTMLElement>()
const palette={classic:['#173f2d','#d5b16a'], 'bamboo-jade':['#214b40','#c3af80'], 'moon-navy':['#24364c','#becddc'], 'sakura-plum':['#49283f','#e0afcb'],'butterfly-gold':['#694b2e','#eed7a0']}
const colors=computed(()=>({'--skin-tone':palette[selectedTableSkin.value][0],'--skin-accent':palette[selectedTableSkin.value][1]}))
const name=computed(()=>LOCAL_SKIN_OPTIONS.find(item=>item.value===selectedTableSkin.value)?.label)
function choose(skin:LocalTableSkin){setLocalTableSkin(skin);panel.value?.hidePopover()}
</script>
<template>
 <div v-if="skinPreviewEnabled" class="local-theme-control" :style="colors">
  <button class="skin-trigger" type="button" popovertarget="local-skin-panel" aria-label="切换牌桌主题" aria-haspopup="true" title="切换牌桌主题">
   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="3" width="12" height="16" rx="3" transform="rotate(-12 10 11)"/><path d="m17 6 3 1v14H8v-1M8 8h4m-4 4h4"/></svg>
   <span>{{name}}</span><svg class="skin-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>
  </button>
  <div id="local-skin-panel" ref="panel" popover class="skin-panel" role="group" aria-label="牌桌主题">
   <p>牌桌主题</p>
   <button v-for="option in LOCAL_SKIN_OPTIONS" :key="option.value" type="button" :aria-pressed="selectedTableSkin===option.value" @click="choose(option.value)">
    <i :style="{background:palette[option.value][0],borderColor:palette[option.value][1]}" aria-hidden="true"></i><span>{{option.label}}</span><span class="skin-check" aria-hidden="true">{{selectedTableSkin===option.value?'✓':''}}</span>
   </button>
  </div>
 </div>
</template>
<style scoped>
/* 原顶栏内的紧凑入口；原生浮层支持点外侧和Escape关闭，不挤动牌区。 */
.local-theme-control{flex-shrink:0;pointer-events:auto}
.local-theme-control .skin-trigger{width:auto;min-width:132px;white-space:nowrap}.skin-trigger svg{flex-shrink:0}
.skin-trigger{display:flex;align-items:center;justify-content:center;gap:7px;height:44px;padding:0 12px;border:1px solid var(--skin-accent);border-radius:12px;background:linear-gradient(145deg,var(--skin-tone),#101d1cee);color:var(--skin-accent);box-shadow:inset 0 1px #ffffff20,0 3px 10px #0004;font:600 13px/1.2 sans-serif;cursor:pointer;touch-action:manipulation}
.skin-trigger:hover{filter:brightness(1.15)}.skin-trigger:focus-visible,.skin-panel button:focus-visible{outline:2px solid #ffe6ab;outline-offset:3px}
.skin-panel{position:fixed;inset:56px 16px auto auto;margin:0;width:216px;max-height:calc(100dvh - 72px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid var(--skin-accent);border-radius:16px;background:linear-gradient(145deg,var(--skin-tone),#0c1818);color:#f5eddb;box-shadow:0 12px 36px #0009;font:14px/1.4 sans-serif}
.skin-panel::backdrop{background:transparent}.skin-panel p{margin:0 6px 8px;color:var(--skin-accent);font-size:12px;letter-spacing:2px}
.skin-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;margin:4px 0;padding:8px 10px;border:1px solid transparent;border-radius:10px;background:#ffffff06;color:inherit;font:inherit;cursor:pointer;touch-action:manipulation}
.skin-panel button:hover,.skin-panel button[aria-pressed=true]{border-color:var(--skin-accent);background:#ffffff12}.skin-panel i{width:23px;height:28px;box-sizing:border-box;border:2px solid;border-radius:5px;box-shadow:inset 0 0 0 2px #ffffff18}.skin-check{margin-left:auto;color:var(--skin-accent)}
</style>
