import {evaluateMachengWin,TILE_KINDS,type TileKind,type Meld} from '../core'
import type {PlayerView} from '../core/bot'
import type {Seat} from '../core'
import {face} from '../../../../p1/adapter'
import type {WaitInfo} from '../../../core/contracts/gamePort'

/** Only the human's private view and public tiles are accepted, never a Game. */
export function createWaitProjection(){
  let key='',kinds:TileKind[]=[]
  return (view:PlayerView,seat:Seat):WaitInfo|null=>{
    const own=view.players[seat]
    if(view.phase==='ended'||own.hand.length!==13-3*own.melds.length)return null
    const nextKey=JSON.stringify([own.hand.map(t=>t.kind).sort(),own.melds,own.specialKongs,view.specials])
    if(nextKey!==key){
      key=nextKey
      const melds:Meld[]=own.melds.map(m=>({type:m.type,tiles:m.tiles,concealed:m.concealed,from:'from' in m?m.from:null}))
      const owned=[...own.hand,...melds.flatMap(m=>m.tiles),...own.specialKongs]
      kinds=TILE_KINDS.filter(kind=>owned.filter(t=>t.kind===kind).length<4&&evaluateMachengWin([...own.hand.map(t=>t.kind),kind],melds,view.specials))
    }
    if(!kinds.length)return null
    const publicTiles=[...own.hand,...view.indicators,...view.players.flatMap(p=>[...p.discards,...p.specialKongs,...p.melds.flatMap(m=>m.tiles)]),...(view.response?[view.response.tile]:[])]
    const visible=[...new Map(publicTiles.map(t=>[t.id,t])).values()]
    const tiles=kinds.map(kind=>({tile:face(kind),remaining:Math.max(0,4-visible.filter(t=>t.kind===kind).length)}))
    return {discard:null,tiles,any:false,remaining:tiles.reduce((sum,t)=>sum+t.remaining,0)}
  }
}
