<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef} from 'vue'
import {currentAccount} from '../account/client'
import {avatarUrl} from '../account/contracts'
import ExitConfirm from '../components/shell/ExitConfirm.vue'
import GameTableHud from '../components/table/GameTableHud.vue'
import GameShellHeader from '../components/shell/GameShellHeader.vue'
import OrientationGate from '../components/shell/OrientationGate.vue'
import SettlementOverlay from '../components/settlement/SettlementOverlay.vue'
import {themePresentationByName,themePresentationCssVariables} from '../theme/themePresentation'
import {face} from '../p1/adapter'
import {seededRandom,type Action} from '../game/variants/macheng/core'
import {createLocalSession,actionTicket} from '../game/variants/macheng/host/localSession'
import {projectLocal} from '../game/variants/macheng/presentation/projectLocal'
import {scenario} from '../game/variants/macheng/fixtures/actionScenarios'
import type {OpeningStage,ActionPrompt,GamePhase} from '../game/core/contracts/gamePort'
import type {TileType} from '../game/core/contracts/types'
import type {TableSession} from '../network/client'
const options=defineProps<{remoteSession?:TableSession;remoteRoomCode?:string;remoteCanContinue?:boolean;remoteNames?:string[];remoteAvatars?:string[];remoteTotalRounds?:number}>()

const emit=defineEmits<{exit:[]}>()
const exitVisible=ref(false)
function confirmQuit(){if(options.remoteSession){exitVisible.value=false;emit('exit');return}location.href='?scene=menu'}
function quit(){exitVisible.value=true}
const query=new URLSearchParams(location.search),caseName=query.get('case')
const cases=['chi','peng','exposed-kong','pass','concealed-kong','add-kong','discard-win','rob-kong','self-win','kong-win','special-kong','competition','multi-hu','draw','ting','red-blocked','pizi-blocked','small-258','small-not-258','big-non258','pizi-single','laizi-single','special-only']
const fixture=!options.remoteSession&&caseName&&cases.includes(caseName)?scenario(caseName):null
const random=query.has('seed')?seededRandom(Number(query.get('seed'))||42):Math.random
const session=options.remoteSession??createLocalSession({idPrefix:`local-${Date.now()}`,random,now:()=>Date.now(),botDelay:650,waitForReady:true,
  ...(fixture?{initialGame:fixture.g,localSeat:fixture.self}:{})})
document.title=options.remoteSession?'红中痞子杠 · 朋友房':'红中痞子杠 · 单机练习'
const snapshot=shallowRef(session.snapshot()),selectedIndex=ref(-1),ready=ref(false),opening=ref<OpeningStage|null>(null)
const restoredResult=!!options.remoteSession&&!!snapshot.value.view.result
const resultVisible=ref(restoredResult),endedAt=ref(restoredResult?Date.now()-4100:0),error=ref('')
const presentation=themePresentationByName('jade'),style=themePresentationCssVariables(presentation)
let mappedKey='',mappedCache:ReturnType<typeof projectLocal>
const mapped=computed(()=>{const s=snapshot.value,names=options.remoteNames??(currentAccount.value?[currentAccount.value.nickname,'下家','对家','上家']:undefined),avatars=options.remoteAvatars??(currentAccount.value?[avatarUrl(currentAccount.value.avatar)]:undefined),key=`${s.view.gameId}/${s.view.version}/${s.autoplay}/${names?.join('|')}/${avatars?.join('|')}`
  if(key!==mappedKey){mappedKey=key;mappedCache=projectLocal(s,names,avatars)}return mappedCache})
// Keep an open choice dialog stable while other eligible seats respond or a second ticks.
let promptKey='',stablePrompt:ActionPrompt|null=null
const actionPrompt=computed(()=>{
  const next=mapped.value.prompt,key=JSON.stringify([snapshot.value.view.response?.id,next])
  if(key!==promptKey){promptKey=key;stablePrompt=next}return stablePrompt
})
const elapsed=ref(restoredResult?4100:0)
const phase=computed<GamePhase>(()=>opening.value?'opening':snapshot.value.view.result?(elapsed.value<2600&&mapped.value.winPresentation?'win-effect':elapsed.value<4100&&mapped.value.winPresentation?'revealing':'settled'):mapped.value.phase)
const roundLabel=computed(()=>`${options.remoteSession?`第${snapshot.value.round}${options.remoteTotalRounds?'/'+options.remoteTotalRounds:''}局 · `:''}${snapshot.value.view.result?'本局结束':opening.value?'开局':mapped.value.isUserTurn?'请出牌':actionPrompt.value?'请选择响应':'等待牌友'}`)
const finalResult=computed(()=>phase.value==='settled'&&mapped.value.result?{...mapped.value.result,...(!options.remoteSession?{roundLabel:'红中痞子杠'}:{})}:null)
const props=computed(()=>({
  themeName:'jade' as const,players:mapped.value.players,user:mapped.value.players[0],phase:phase.value,
  wall:Array(Math.max(0,snapshot.value.view.remaining-1)).fill('east'),wallHeadDrawn:snapshot.value.wallHeadDrawn,
  wallCount:snapshot.value.view.remaining,currentPlayer:mapped.value.currentPlayer,selectedIndex:selectedIndex.value,
  turnSeconds:Math.max(0,Math.ceil((snapshot.value.view.deadline-snapshot.value.now)/1000)),lastDiscard:mapped.value.lastDiscard,
  actionPrompt:actionPrompt.value,announcement:error.value?{text:error.value,tone:'warning',id:snapshot.value.view.version}:null,
  tableActionEvent:mapped.value.tableActionEvent,scoreFlowEvent:null,result:finalResult.value,
  winEffect:phase.value==='win-effect'&&mapped.value.winPresentation?{...mapped.value.winPresentation,id:snapshot.value.presentation.win!.id,duration:2600,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}:null,
  winPresentation:mapped.value.winPresentation,revealHands:!!snapshot.value.view.result&&phase.value!=='win-effect',matchFinished:false,winningPlayerIndex:mapped.value.winPresentation?.winnerIndex??-1,
  dealer:mapped.value.dealer,isUserTurn:!opening.value&&mapped.value.isUserTurn,userCanHu:!opening.value&&mapped.value.userCanHu,
  matchName:'红中痞子杠',roundLabel:roundLabel.value,dealAnimation:{playerIndex:-1,count:0,serial:0},openingStage:opening.value,
  diceValues:[3,4],diceThrowerIndex:mapped.value.dealer,userCurrentWaits:mapped.value.userCurrentWaits,userTingOptions:[],userDiscardWaits:null,
  userKongs:opening.value?[]:mapped.value.userKongs,userHasWindKong:false,autoPlayEnabled:!opening.value,autoPlay:snapshot.value.autoplay,
  jokerTiles:[],wildcardTiles:[],flipTile:face(snapshot.value.view.specials.pizi),flipStack:67,wallBreakIndex:0,
  specialTileInfo:{pizi:face(snapshot.value.view.specials.pizi),laizi:face(snapshot.value.view.specials.laizi),indicators:snapshot.value.view.indicators.map(t=>face(t.kind))},
  hideSpecialTileHint:true,actionCueDurationMs:650,touchActionButtons:true,waitReminders:true,
  userDiscardableIndices:mapped.value.ids.flatMap((id,i)=>mapped.value.actions.some(a=>a.type==='discard'&&a.tileId===id)?[i]:[]),
}))
function sync(){
  const next=session.snapshot(),old=snapshot.value
  if(next.view.version!==old.view.version||next.view.gameId!==old.view.gameId||next.autoplay!==old.autoplay){selectedIndex.value=-1;error.value=''}
  if(next.view.result&&!old.view.result){endedAt.value=Date.now();elapsed.value=0;resultVisible.value=false}
  if(!next.view.result){endedAt.value=0;elapsed.value=0;resultVisible.value=false}
  snapshot.value=next
}
function submit(action?:Action){
  if(!action||opening.value||!ready.value)return
  const submitted=session.submit(action,actionTicket(snapshot.value.view))
  const finish=(ok:boolean)=>{if(!ok)error.value='操作已更新或连接未就绪，请按最新牌局操作。';sync()}
  if(submitted instanceof Promise)void submitted.then(finish);else finish(submitted)
}
function perform(type:Action['type']){submit(mapped.value.actions.find(a=>a.type===type))}
function select(index:number){if(mapped.value.isUserTurn&&!opening.value&&mapped.value.ids[index])selectedIndex.value=index}
function discard(index:number){const id=mapped.value.ids[index];if(id)submit(mapped.value.actions.find(a=>a.type==='discard'&&a.tileId===id))}
function gang(tile:TileType){submit(mapped.value.kongAction(tile))}
function toggleAuto(){const pending=session.setAutoplay(!snapshot.value.autoplay);if(pending instanceof Promise)void pending.then(ok=>{if(!ok)error.value='托管设置未确认，请按最新状态重试。';sync()});else sync()}
let openingTimer:ReturnType<typeof setInterval>|undefined
function tableReady(){
  if(ready.value)return
  ready.value=true
  if(fixture||options.remoteSession){session.startReady();sync();return}
  const stages:OpeningStage[]=['start','dice','flip','deal'];let index=0;opening.value=stages[0]
  openingTimer=setInterval(()=>{index++;if(index===stages.length){clearInterval(openingTimer);opening.value=null;session.startReady();sync()}else opening.value=stages[index]},750)
}
function nextRound(){const next=session.nextRound();const finish=(ok:boolean)=>{if(ok){sync();selectedIndex.value=-1}};if(next instanceof Promise)void next.then(finish);else finish(next)}
let publishedSecond=Math.floor(Date.now()/1000)
const ticker=setInterval(()=>{
  const changed=session.advance(),now=Date.now(),second=Math.floor(now/1000)
  if(changed||second!==publishedSecond){publishedSecond=second;sync()}
  if(endedAt.value){const old=elapsed.value;elapsed.value=now-endedAt.value;if(old<4100&&elapsed.value>=4100)resultVisible.value=true}
},100)
onBeforeUnmount(()=>{clearInterval(ticker);clearInterval(openingTimer);session.dispose()})
const standings=computed(()=>mapped.value.players.map((p,i)=>({...p,playerIndex:i,rank:1+mapped.value.players.filter(o=>o.score>p.score).length})))
</script>
<template>
  <OrientationGate theme-name="jade" />
  <main class="game-app" :class="presentation.typography.headingClass" data-table-theme="jade"
    :data-theme-player-frame="presentation.hud.playerFrame" :data-theme-particle="presentation.shell.particle" :data-theme-loading="presentation.presentation.loading" :style="style"
    :data-scene="options.remoteSession?'online':'play'" :data-network-room="options.remoteRoomCode" :data-ready="ready" :data-started="snapshot.started" :data-local-seat="snapshot.localSeat"
    :data-version="snapshot.view.version" :data-phase="snapshot.view.phase" :data-turn="snapshot.view.turn" :data-round="snapshot.round"
    :data-local-ids="JSON.stringify(mapped.ids)" :data-selected-index="selectedIndex" :data-conservation="JSON.stringify(snapshot.conservation)"
    :data-wall-count="snapshot.view.remaining" :data-totals="JSON.stringify(snapshot.totals)">
    <div class="has-three-scene">
      <GameShellHeader game-mode="local" :phase="phase" :has-players="true" match-name="红中痞子杠" :round-label="roundLabel" :honba="0" :base-score="1" :room-id="options.remoteRoomCode??''" :signal-quality="3" theme-name="jade" theme-locked theme-lock-reason="当前牌桌主题" presentation-only minimal-controls quit-enabled @quit="quit" />
      <GameTableHud v-bind="props" @ready="tableReady" @select-tile="select" @clear-selection="selectedIndex=-1" @discard="discard"
        @pass="perform('pass')" @peng="perform('peng')" @chi="index=>submit(mapped.chis[index])" @gang-from-discard="perform('exposed-kong')" @gang="gang" @hu="perform('hu')" @toggle-auto-play="toggleAuto" />
    </div>
    <SettlementOverlay :result="finalResult" v-model:result-visible="resultVisible" :match-finished="false" :dealer="mapped.dealer" :waiting-next-round="Boolean(options.remoteSession&&!options.remoteCanContinue)" game-mode="local" :continue-countdown="0" match-name="红中痞子杠" :standings="standings" player-id="local" :human-seats="[0]" theme-name="jade" :joker-tiles="[]" :wildcard-tiles="[]" @next-round="nextRound" :menu-exit-enabled="!options.remoteSession" :network-layout="!!options.remoteSession" @return-to-lobby="quit"><template #extra-actions><slot name="network-actions"/></template></SettlementOverlay>
    <ExitConfirm v-if="exitVisible" :online="!!options.remoteSession" :settled="!!snapshot.view.result" @cancel="exitVisible=false" @confirm="confirmQuit" />
    <details v-if="query.has('debug')" class="play-evidence"><summary>{{options.remoteSession?'联网受限视图':'单机规则证据'}}</summary><pre :aria-label="options.remoteSession?'本家联网视图':'本家单机视图'">{{JSON.stringify(snapshot,null,2)}}</pre></details>
  </main>
</template>
<style scoped>
.play-evidence{position:fixed;left:10px;top:52px;z-index:200;max-width:370px;max-height:35vh;overflow:auto;background:#102b24e8;color:#fff;font-size:12px}pre{white-space:pre-wrap}.macheng-rules{max-width:640px;max-height:85vh;overflow:auto}.macheng-rules p{line-height:1.6;margin:12px 0}
.game-app :deep(.result-reopen:not(.continue)){top:52px;left:12px;right:auto;bottom:auto}
</style>
