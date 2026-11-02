import type {GamePlayer, Meld, TileType} from '../game/core/contracts/types'

export type Kind = `${'wan'|'tong'|'tiao'}-${1|2|3|4|5|6|7|8|9}` | 'east'|'south'|'west'|'north'|'red'|'green'|'white'
export interface Tile {id:string; kind:Kind}
export interface PublicMeld {type:'chi'|'peng'|'kong'; tiles:Tile[]; count?:number; concealed:boolean; from:number|null; added?:boolean}
export interface SeatView {seat:number; hand:Tile[]; concealedTileCount:number; melds:PublicMeld[]; specialKongs:Tile[]; discards:Tile[]}
export interface TableView {version:number; localSeat:number; turn:number; wallCount:number; indicators:Tile[]; pizi:Kind; laizi:Kind; players:SeatView[]}
export function face(kind:Kind):TileType {
  const match = /^(wan|tong|tiao)-([1-9])$/.exec(kind)
  if (match) return `${({wan:'m',tong:'p',tiao:'s'} as const)[match[1]]}${match[2]}` as TileType
  if (['east','south','west','north','red','green','white'].includes(kind)) return kind as TileType
  throw new Error(`Unknown tile kind: ${kind}`)
}
export function adapt(view:TableView) {
  if (view.players.length!==4 || new Set(view.players.map(p=>p.seat)).size!==4 || view.players.some(p=>p.seat<0||p.seat>3)) throw new Error('Four unique seats required')
  const relative = (seat:number)=>(seat-view.localSeat+4)%4
  const ordered = [...view.players].sort((a,b)=>relative(a.seat)-relative(b.seat))
  const players:GamePlayer[] = ordered.map(p=>{
    const melds:Meld[] = p.melds.map(m=>m.concealed && p.seat!==view.localSeat ? {
      type:'angang',tile:'east',tiles:Array(m.count??4).fill('east'),hidden:true,
    } : ({
      type:m.type==='kong'?(m.concealed?'angang':'gang'):m.type,
      // Old engine appends the claimed tile after the two tiles consumed from hand.
      tile:face(m.tiles[m.type==='chi'?m.tiles.length-1:0].kind), tiles:m.tiles.map(t=>face(t.kind)),
      ...(m.from===null?{}:{from:relative(m.from)}), added:m.added,
    }))
    // Upstream flower is a one-tile public group, explicitly excluded from ordinary meld count.
    for (const tile of p.specialKongs) melds.push({type:'flower',tile:face(tile.kind),tiles:[face(tile.kind)],specialSingle:true})
    return {name:['本家','下家','对家','上家'][relative(p.seat)],avatar:`${import.meta.env.BASE_URL}avatars/${['lotus','ah-lok','shisan','young-master'][p.seat]}.svg`,
      seat:p.seat,score:0,hand:p.seat===view.localSeat?p.hand.map(t=>face(t.kind)):[],concealedTileCount:p.concealedTileCount,
      melds,discards:p.discards.map(t=>face(t.kind)),redCount:0,drawnTileIndex:p.seat===view.localSeat&&view.turn===p.seat?p.hand.length-1:-1}
  })
  const ids = ordered[0].hand.map(t=>t.id)
  return {players,currentPlayer:relative(view.turn),ids,
    discard(index:number) {
      if (view.turn!==view.localSeat || !Number.isInteger(index) || index<0 || index>=ids.length) throw new Error('Invalid discard intent')
      return {type:'discard' as const,tileId:ids[index],actor:view.localSeat,expectedVersion:view.version}
    }}
}
