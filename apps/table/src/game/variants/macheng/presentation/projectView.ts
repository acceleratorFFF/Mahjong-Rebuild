import {adapt,type TableView} from '../../../../p1/adapter'
import type {ManualSnapshot} from '../host/manualSession'

// Only the privacy-filtered host snapshot is accepted here, never the full Game.
export function projectView(snapshot:ManualSnapshot) {
  const {view,localSeat}=snapshot
  const table:TableView={version:view.version,localSeat,turn:view.turn,wallCount:view.remaining,
    indicators:view.indicators,pizi:view.specials.pizi,laizi:view.specials.laizi,
    players:view.players.map((p,seat)=>({seat,hand:p.hand,concealedTileCount:p.handCount,
      specialKongs:p.specialKongs,discards:p.discards,
      melds:p.melds.map(m=>({type:m.type,tiles:m.tiles,count:m.count,concealed:m.concealed,from:'from' in m?m.from:null}))}))}
  const mapped=adapt(table)
  for(const p of mapped.players){
    const source=table.players[p.seat]
    const base=13-source.melds.length*3
    p.drawnTileIndex=p.seat===localSeat
      ? source.hand.findIndex(t=>t.id===snapshot.ownDrawnId)
      : source.concealedTileCount>base?source.concealedTileCount-1:-1
  }
  const relative=(seat:number)=>(seat-localSeat+4)%4
  return {table,...mapped,
    isUserTurn:view.phase==='action'&&view.turn===localSeat&&view.actions.some(a=>a.type==='discard'),
    phase:view.phase==='action'?'discard' as const:view.phase==='response'?'checking' as const:'settled' as const,
    lastDiscard:snapshot.lastDiscard?{tile:mapped.players[relative(snapshot.lastDiscard.from)].discards.at(-1)!,from:relative(snapshot.lastDiscard.from),id:snapshot.lastDiscard.id}:null,
    dealer:relative(view.dealer)}
}
