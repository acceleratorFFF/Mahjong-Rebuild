<script setup lang="ts">
import {computed,ref} from 'vue'
import GameTableHud from '../components/table/GameTableHud.vue'
import GameShellHeader from '../components/shell/GameShellHeader.vue'
import OrientationGate from '../components/shell/OrientationGate.vue'
import {themePresentationByName,themePresentationCssVariables} from '../theme/themePresentation'
import {adapt,face} from './adapter'
import {baselinePlayers,fixedScene,type SceneName} from './fixtures'
const query=new URLSearchParams(location.search)
const sceneName=query.get('scene')??'fixed'
const baseline=sceneName==='baseline'
const localSeat=baseline?0:Math.max(0,Math.min(3,Math.trunc(Number(query.get('seat'))||0)))
const focusSeat=Math.max(0,Math.min(3,Math.trunc(Number(query.get('focus')??localSeat)||0)))
const scene=fixedScene((['rivers','melds','specials'].includes(sceneName)?sceneName:'fixed') as SceneName,localSeat,focusSeat), mapped=adapt(scene)
const players=baseline?baselinePlayers():mapped.players
const localIds=baseline?players[0].hand.map((tile,index)=>`baseline:${index}:${tile}`):mapped.ids
const selectedIndex=ref(-1),ready=ref(false),intents=ref<unknown[]>([])
const presentation=themePresentationByName('jade')
const style=themePresentationCssVariables(presentation)
const debug=query.has('debug')
const props=computed(()=>({themeName:'jade' as const,players,user:players[0],phase:'discard' as const,
  // Wall faces stay hidden. Placeholders convey geometry count, never private wall order.
  // The upstream flip presenter adds the one hidden base tile separately.
  wall:Array(baseline?83:Math.max(0,scene.wallCount-1)).fill('east'),wallHeadDrawn:0,wallCount:baseline?83:scene.wallCount,currentPlayer:0,selectedIndex:selectedIndex.value,turnSeconds:30,
  lastDiscard:null,actionPrompt:null,announcement:null,tableActionEvent:null,scoreFlowEvent:null,result:null,winEffect:null,winPresentation:null,
  revealHands:false,matchFinished:false,winningPlayerIndex:-1,dealer:0,isUserTurn:true,userCanHu:false,matchName:'P1 固定场景',roundLabel:'展示验证',
  dealAnimation:{playerIndex:-1,count:0,serial:0},openingStage:null,diceValues:[3,4],diceThrowerIndex:0,userCurrentWaits:null,userTingOptions:[],userDiscardWaits:null,userKongs:[],userHasWindKong:false,
  jokerTiles:[],wildcardTiles:[],flipTile:baseline?null:face(scene.pizi),flipStack:baseline?undefined:67,wallBreakIndex:0,
  specialTileInfo:baseline?undefined:{pizi:face(scene.pizi),laizi:face(scene.laizi)},
}))
function select(index:number){if(!Number.isInteger(index)||index<0||index>=localIds.length)throw new Error('Invalid selection');selectedIndex.value=index;intents.value.push({type:'select',index,tileId:localIds[index],actor:baseline?0:scene.localSeat,expectedVersion:7})}
function clear(){const previousIndex=selectedIndex.value;if(previousIndex>=0)intents.value.push({type:'clear-selection',index:previousIndex,tileId:localIds[previousIndex]});selectedIndex.value=-1}
function discard(index:number){intents.value.push(baseline?{type:'discard',index}:mapped.discard(index));selectedIndex.value=-1}
</script>
<template>
  <OrientationGate theme-name="jade" />
  <main class="game-app" :class="presentation.typography.headingClass" data-table-theme="jade" :data-theme-player-frame="presentation.hud.playerFrame" :data-theme-particle="presentation.shell.particle" :data-theme-loading="presentation.presentation.loading" :style="style" :data-ready="ready" :data-scene="sceneName" :data-local-seat="scene.localSeat" :data-selected-index="selectedIndex" :data-local-ids="JSON.stringify(localIds)">
    <div class="has-three-scene">
      <GameShellHeader game-mode="local" phase="discard" :has-players="true" match-name="麻城" round-label="固定场景" :honba="0" :base-score="1" room-id="" :signal-quality="3" theme-name="jade" theme-locked theme-lock-reason="P1 固定牌桌" presentation-only />
      <GameTableHud v-bind="props" @ready="ready=true" @select-tile="select" @clear-selection="clear" @discard="discard" />
    </div>
    <details v-show="debug" class="p1-evidence"><summary>{{baseline?'上游组件原样基线':'麻城固定场景'}} · {{ready?'就绪':'加载中'}}</summary>
      <p v-if="!baseline">指示牌/痞子：九万；赖子：一万。单张亮杠：红中、痞子、赖子。只记录意图，不推进规则。</p>
      <p v-if="!baseline">场景 {{sceneName}} · 本家绝对座位 {{scene.localSeat}} · 剩余 {{scene.wallCount}} 张 · 四方弃牌 {{scene.players.map(p=>p.discards.length).join('/')}}</p>
      <pre aria-label="操作意图">{{JSON.stringify(intents,null,2)}}</pre>
      <a :href="baseline?'./':'?scene=baseline'">{{baseline?'麻城场景':'原版基线'}}</a>
    </details>
  </main>
</template>
<style scoped>
.p1-evidence{position:fixed;left:10px;top:52px;z-index:200;font-size:12px;max-width:380px;background:#102b24e8;padding:6px;color:#fff;max-height:38vh;overflow:auto}a{color:#f5d78e}pre{white-space:pre-wrap}
</style>
