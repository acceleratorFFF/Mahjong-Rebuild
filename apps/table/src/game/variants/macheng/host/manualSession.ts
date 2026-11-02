import {applyCommand,assertConservation,playerView,RuleError,type Command,type Seat,type Tile} from '../core'
import {createFixedGame} from '../fixtures/fixedGame'

export type VisibleView=ReturnType<typeof playerView>
export interface PublicDiscard {tile:Tile;from:Seat;id:number}
export interface Receipt {
  command:Command;ok:boolean;duplicate:boolean;beforeVersion:number;afterVersion:number;error?:string
}
export interface ManualSnapshot {
  view:VisibleView;localSeat:Seat;wallHeadDrawn:number;lastDiscard:PublicDiscard|null
  ownDrawnId:string|null;conservation:{total:number;unique:number;valid:true}
}

/** Trusted local rule owner. Only restricted snapshots leave this closure.
 * There is no bot, timer, WebSocket, persistence, or debug window game reference.
 */
export function createManualSession(options:{localSeat?:Seat;now?:()=>number}={}) {
  const localSeat=options.localSeat??0
  let game=createFixedGame(localSeat,options.now??(()=>1000)),serial=0,headDraws=53
  let lastDiscard:PublicDiscard|null=null
  const snapshot=():ManualSnapshot=>{
    assertConservation(game)
    const tiles=[...game.wall,...game.indicators,...game.players.flatMap(p=>[...p.hand,...p.discards,...p.specialKongs,...p.melds.flatMap(m=>m.tiles)]),
      ...(game.result?.type==='win'&&game.result.claimedTile?[game.result.claimedTile]:[])]
    return {view:playerView(game,localSeat),localSeat,wallHeadDrawn:headDraws,
      lastDiscard:lastDiscard?structuredClone(lastDiscard):null,
      ownDrawnId:game.lastDraw?.seat===localSeat?game.lastDraw.tileId:null,
      conservation:{total:tiles.length,unique:new Set(tiles.map(t=>t.id)).size,valid:true}}
  }
  function submit(input:Command):Receipt {
    const command=structuredClone(input),beforeVersion=game.version
    try {
      if(command.actor!==localSeat)throw new RuleError('WRONG_ACTOR')
      if(command.action.type!=='discard')throw new RuleError('UNSUPPORTED_ACTION')
      const next=applyCommand(game,command,options.now?.()??game.updatedAt+1)
      assertConservation(next)
      const duplicate=next===game
      if(!duplicate){
        const tile=game.players[localSeat].hand.find(t=>t.id===(command.action as {tileId:string}).tileId)!
        if(next.players[localSeat].discards.some(t=>t.id===tile.id))lastDiscard={tile:{...tile},from:localSeat,id:next.version}
        if(next.lastDraw&&!next.lastDraw.afterKong&&next.lastDraw.tileId!==game.lastDraw?.tileId)headDraws++
        game=next
      }
      return {command,ok:true,duplicate,beforeVersion,afterVersion:game.version}
    } catch(error){
      if(!(error instanceof RuleError))throw error
      return {command,ok:false,duplicate:false,beforeVersion,afterVersion:game.version,error:error.code}
    }
  }
  function discard(tileId:string,version=game.version):Receipt {
    return submit({gameId:game.id,commandId:`manual:${localSeat}:${++serial}`,actor:localSeat,expectedVersion:version,action:{type:'discard',tileId}})
  }
  return {snapshot,submit,discard}
}
