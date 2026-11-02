import {projectView} from './projectView'
import {face} from '../../../../p1/adapter'
import {TILE_KINDS,type Action} from '../core'
import type {LocalSnapshot} from '../host/localSession'
import type {ActionPrompt,RoundResult} from '../../../core/contracts/gamePort'
import type {TableActionEvent,WinPresentation} from '../../../core/contracts/types'
import {createWaitProjection} from './waits'
const projectWaits=createWaitProjection()

export function projectLocal(s:LocalSnapshot,names?:readonly string[],avatars?:readonly string[]){
  const own=s.view.players[s.localSeat].hand
  const sorted=[...own].sort((a,b)=>a.id===s.ownDrawnId?1:b.id===s.ownDrawnId?-1:TILE_KINDS.indexOf(a.kind)-TILE_KINDS.indexOf(b.kind)||a.id.localeCompare(b.id))
  const view={...s.view,players:(s.roundEndPlayers??s.view.players).map((p,i)=>i===s.localSeat?{...p,hand:sorted}:p)}
  const m=projectView({...s,view}),relative=(seat:number)=>(seat-s.localSeat+4)%4
  for(const p of m.players){
    p.name=names?.[p.seat]??p.name; p.avatar=avatars?.[p.seat]??p.avatar
    if(s.roundEndPlayers&&p.seat!==s.localSeat){
      p.hand=s.roundEndPlayers[p.seat].hand.map(t=>face(t.kind))
      s.roundEndPlayers[p.seat].melds.forEach((meld,i)=>{if(meld.concealed)p.melds[i]={type:'angang',tiles:meld.tiles.map(t=>face(t.kind)),tile:face(meld.tiles[0].kind),hidden:false}})
    }
    p.score=s.totals[p.seat];p.playerKind=p.seat===s.localSeat?'human':'bot'
    p.melds.forEach((meld,i)=>{if(s.presentation.addedMelds[`${p.seat}/${i}`])meld.added=true})
  }
  const actions=s.autoplay?[]:s.view.actions, response=s.view.response
  const chis=actions.filter((a):a is Extract<Action,{type:'chi'}>=>a.type==='chi')
  const kongActions=actions.filter(a=>['special-kong','concealed-kong','add-kong'].includes(a.type))
  function actionFace(a:Action){return a.type==='concealed-kong'?face(a.kind):'tileId' in a?face(own.find(t=>t.id===a.tileId)!.kind):null}
  const onlySpecial=kongActions.length>0&&kongActions.every(a=>a.type==='special-kong')
  const userKongs=onlySpecial?[]:[...new Set(kongActions.map(actionFace).filter(Boolean))]
  const prompt:ActionPrompt|null=response&&actions.length?{
    type:response.source==='add-kong'?'rob':'claim',tile:face(response.tile.kind),from:relative(response.from),
    canHu:actions.some(a=>a.type==='hu'),canPeng:actions.some(a=>a.type==='peng'),canGang:actions.some(a=>a.type==='exposed-kong'),
    chiOptions:chis.map(a=>({kind:'sequence',tiles:[...a.tileIds.map(id=>face(own.find(t=>t.id===id)!.kind)),face(response.tile.kind)]})),
  }:null
  const event=s.presentation.tableAction
  const tableActionEvent:TableActionEvent|null=event?{id:event.id,type:event.type,actorIndex:relative(event.actor),sourceIndex:event.from===null?null:relative(event.from),tile:face(event.tile),meldIndex:event.meldIndex}:null
  const win=s.presentation.win
  const winPresentation:WinPresentation|null=win?{winnerIndex:relative(win.winner),tile:face(win.tile.kind),sourceIndex:win.winner===s.localSeat?sorted.findIndex(t=>t.id===win.tile.id):win.sourceIndex,
    robbedKong:win.method==='rob-kong',discardWin:win.method==='discard',robbedKongPlayerIndex:win.from===null?-1:relative(win.from),robbedKongMeldIndex:-1}:null
  const r=s.view.result
  let result:RoundResult|null=null
  if(r){
    const scoreChanges=m.players.map((p,i)=>({...p,playerIndex:i,delta:r.deltas[p.seat],rank:1+m.players.filter(o=>o.score>p.score).length}))
    result={presentationKey:r.eventId,draw:r.type==='draw',roundLabel:`麻城 第${s.round}局`,scoreChanges}
    if(r.type==='win'){
      const pattern={'small':'小胡','all-triplets':'碰碰胡','pure-suit':'清一色','all-258':'将一色'}[r.win.pattern]
      Object.assign(result,{winnerIndex:relative(r.winner),winner:m.players[relative(r.winner)].name,winTile:face(win!.tile.kind),
        winType:r.method==='self'?'self-draw':r.method==='discard'?'discard':'robbed-kong',robbedKong:r.method==='rob-kong',
        multiplier:r.score.payment,totalMultiplier:r.score.payment,totalWon:r.deltas[r.winner],points:r.score.payment,
        details:[{label:pattern,multiplier:r.score.base},{label:r.win.hard?'硬胡':'软胡',multiplier:r.score.hardMultiplier},
          {label:`杠数 ${r.score.kongCount}`,multiplier:2**r.score.kongCount},{label:'杠开／抢杠加成',multiplier:r.score.specialMultiplier},
          {label:`封顶前 ${r.score.uncapped}；单家支付 P=min(32,${r.score.uncapped})=${r.score.payment}`}],
      })
    }
  }
  return {...m,isUserTurn:m.isUserTurn&&!s.autoplay,actions,prompt,chis,userKongs,
    kongAction:(tile:ReturnType<typeof face>)=>kongActions.find(a=>actionFace(a)===tile),
    lastDiscard:s.lastDiscard?{tile:face(s.lastDiscard.tile.kind),from:relative(s.lastDiscard.from),id:s.lastDiscard.id}:null,
    tableActionEvent,winPresentation,result,userCurrentWaits:projectWaits(s.view,s.localSeat),userCanHu:actions.some(a=>a.type==='hu')}
}
