<script setup lang="ts">
import {computed,ref,shallowRef} from 'vue'
import GameTableHud from '../components/table/GameTableHud.vue'
import GameShellHeader from '../components/shell/GameShellHeader.vue'
import OrientationGate from '../components/shell/OrientationGate.vue'
import {themePresentationByName,themePresentationCssVariables} from '../theme/themePresentation'
import {face} from '../p1/adapter'
import {createManualSession,type Receipt} from '../game/variants/macheng/host/manualSession'
import {projectView} from '../game/variants/macheng/presentation/projectView'
import type {Seat} from '../game/variants/macheng/core'

const query=new URLSearchParams(location.search)
document.title='P2 麻城手动规则闭环'
const localSeat=Math.max(0,Math.min(3,Math.trunc(Number(query.get('seat'))||0))) as Seat
const session=createManualSession({localSeat})
const snapshot=shallowRef(session.snapshot()),selectedIndex=ref(-1),ready=ref(false)
const receipts=ref<Receipt[]>([]),notice=ref('')
const mapped=computed(()=>projectView(snapshot.value))
const presentation=themePresentationByName('jade'),style=themePresentationCssVariables(presentation)
const debug=query.has('debug')
const roundLabel=computed(()=>snapshot.value.view.phase==='response'?'等待其他玩家响应':mapped.value.isUserTurn?'请手动出牌':`等待${mapped.value.players[mapped.value.currentPlayer]?.name??'其他玩家'}行动`)
const props=computed(()=>({
  themeName:'jade' as const,players:mapped.value.players,user:mapped.value.players[0],phase:mapped.value.phase,
  // The original renderer adds the indicator and its hidden base separately.
  wall:Array(Math.max(0,snapshot.value.view.remaining-1)).fill('east'),wallHeadDrawn:snapshot.value.wallHeadDrawn,
  wallCount:snapshot.value.view.remaining,currentPlayer:mapped.value.currentPlayer,selectedIndex:selectedIndex.value,
  turnSeconds:0,lastDiscard:mapped.value.lastDiscard,actionPrompt:null,
  announcement:notice.value?{text:notice.value,tone:'warning',id:receipts.value.length}:null,
  tableActionEvent:null,scoreFlowEvent:null,result:null,winEffect:null,winPresentation:null,
  revealHands:false,matchFinished:false,winningPlayerIndex:-1,dealer:mapped.value.dealer,
  isUserTurn:mapped.value.isUserTurn,userCanHu:false,matchName:'麻城',roundLabel:roundLabel.value,
  dealAnimation:{playerIndex:-1,count:0,serial:0},openingStage:null,diceValues:[3,4],diceThrowerIndex:mapped.value.dealer,
  userCurrentWaits:null,userTingOptions:[],userDiscardWaits:null,userKongs:[],userHasWindKong:false,
  jokerTiles:[],wildcardTiles:[],flipTile:face(snapshot.value.view.specials.pizi),flipStack:67,wallBreakIndex:0,
  specialTileInfo:{pizi:face(snapshot.value.view.specials.pizi),laizi:face(snapshot.value.view.specials.laizi)},
}))
function select(index:number){if(mapped.value.isUserTurn&&mapped.value.ids[index])selectedIndex.value=index}
function clear(){selectedIndex.value=-1}
function discard(index:number){
  if(!mapped.value.isUserTurn)return
  const tileId=mapped.value.ids[index]
  if(!tileId)return
  const receipt=session.discard(tileId,snapshot.value.view.version)
  receipts.value.push(receipt)
  snapshot.value=session.snapshot()
  selectedIndex.value=-1
  notice.value=receipt.ok?'':'操作未生效，请按当前牌局重新选择。'
}
</script>
<template>
  <OrientationGate theme-name="jade" />
  <main class="game-app" :class="presentation.typography.headingClass" data-table-theme="jade"
    :data-theme-player-frame="presentation.hud.playerFrame" :data-theme-particle="presentation.shell.particle" :data-theme-loading="presentation.presentation.loading" :style="style"
    :data-ready="ready" data-scene="p2" :data-local-seat="localSeat" :data-local-ids="JSON.stringify(mapped.ids)"
    :data-selected-index="selectedIndex" :data-version="snapshot.view.version" :data-phase="snapshot.view.phase" :data-turn="snapshot.view.turn"
    :data-wall-count="snapshot.view.remaining" :data-conservation="JSON.stringify(snapshot.conservation)"
    :data-discard-ids="JSON.stringify(snapshot.view.players.map(p=>p.discards.map(t=>t.id)))">
    <div class="has-three-scene">
      <GameShellHeader game-mode="local" :phase="mapped.phase" :has-players="true" match-name="麻城" :round-label="roundLabel" :honba="0" :base-score="1" room-id="" :signal-quality="3" theme-name="jade" theme-locked theme-lock-reason="当前牌桌主题" presentation-only />
      <GameTableHud v-bind="props" @ready="ready=true" @select-tile="select" @clear-selection="clear" @discard="discard" />
    </div>
    <details v-show="debug" class="p2-evidence">
      <summary>P2 手动规则闭环 · {{ready?'就绪':'加载中'}}</summary>
      <p>固定开局；仅手动出牌。其他玩家不会自动行动，计时暂停。刷新可重新开始。</p>
      <pre aria-label="规则命令记录">{{JSON.stringify(receipts,null,2)}}</pre>
      <pre aria-label="本家可见牌局">{{JSON.stringify(snapshot,null,2)}}</pre>
    </details>
  </main>
</template>
<style scoped>
.p2-evidence{position:fixed;left:10px;top:52px;z-index:200;font-size:12px;max-width:380px;background:#102b24e8;padding:6px;color:#fff;max-height:38vh;overflow:auto}pre{white-space:pre-wrap}
</style>
