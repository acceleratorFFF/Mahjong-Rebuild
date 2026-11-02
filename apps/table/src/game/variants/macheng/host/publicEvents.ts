import type {Game,Seat,Tile,TileKind} from '../core'
import type {TableActionType} from '../../../core/contracts/types'
import type {PublicDiscard} from './manualSession'
export interface PublicAction {id:number;type:TableActionType;actor:Seat;from:Seat|null;tile:TileKind;meldIndex:number}
export interface PublicWin {id:number;winner:Seat;from:Seat|null;method:'self'|'discard'|'rob-kong';tile:Tile;sourceIndex:number}
/** Called only by the trusted local owner; never returns a Game or private log. */
export function createPublicEvents(localSeat:Seat){
  let serial=0,lastDiscard:PublicDiscard|null=null,action:PublicAction|null=null,win:PublicWin|null=null
  let added:Record<string,boolean>={},head=53
  function reset(game:Game){lastDiscard=null;action=null;win=null;added={};head=136-game.indicators.length-game.wall.length}
  function accept(before:Game,after:Game){
    if(before===after)return
    for(const seat of [0,1,2,3] as Seat[]){
      const a=before.players[seat],b=after.players[seat]
      for(const tile of b.discards)if(!a.discards.some(t=>t.id===tile.id))lastDiscard={tile:{...tile},from:seat,id:++serial}
      for(let i=0;i<b.melds.length;i++){
        const meld=b.melds[i],previous=a.melds[i]
        if(!previous||previous.type==='peng'&&meld.type==='kong'){
          const isAdded=!!previous
          if(isAdded)added[`${seat}/${i}`]=true
          const type:TableActionType=isAdded?'added-gang':meld.type==='chi'?'chi':meld.type==='peng'?'peng':meld.concealed?'concealed-gang':'discard-gang'
          // Concealed opponent kong faces must not leak via animation metadata.
          const tile=meld.concealed&&seat!==localSeat?'east':meld.tiles[meld.type==='chi'?meld.tiles.length-1:0].kind
          action={id:++serial,type,actor:seat,from:meld.from,tile,meldIndex:i}
        }
      }
      if(b.specialKongs.length>a.specialKongs.length)action={id:++serial,type:'flower-gang',actor:seat,from:null,tile:b.specialKongs.at(-1)!.kind,meldIndex:b.melds.length+b.specialKongs.length-1}
    }
    if(after.lastDraw&&!after.lastDraw.afterKong&&after.lastDraw.tileId!==before.lastDraw?.tileId)head++
    if(lastDiscard&&!after.players[lastDiscard.from].discards.some(t=>t.id===lastDiscard!.tile.id))lastDiscard=null
    if(after.result?.type==='win'&&!before.result){
      const r=after.result,p=after.players[r.winner],tile=r.claimedTile??p.hand.find(t=>t.id===after.lastDraw?.tileId)??p.hand.at(-1)!
      win={id:++serial,winner:r.winner,from:r.from,method:r.method,tile:{...tile},sourceIndex:p.hand.findIndex(t=>t.id===tile.id)}
      action={id:win.id,type:r.method==='self'?'self-draw':r.method==='discard'?'discard-win':'robbed-kong-win',actor:r.winner,from:r.from,tile:tile.kind,meldIndex:-1}
    }
  }
  function snapshot(){return structuredClone({lastDiscard,tableAction:action,win,addedMelds:added,wallHeadDrawn:head})}
  return {reset,accept,snapshot}
}
