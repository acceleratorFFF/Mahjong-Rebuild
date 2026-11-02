import {adapt, type Kind, type Tile, type TableView} from './adapter'
const honors:Kind[]=['east','south','west','north','red','green','white']
export const kinds:Kind[]=[...(['wan','tong','tiao'] as const).flatMap(s=>Array.from({length:9},(_,i)=>`${s}-${i+1}` as Kind)),...honors]
export type SceneName = 'fixed'|'rivers'|'melds'|'specials'
export function fixedScene(name:SceneName='fixed', localSeat=0, focusSeat=localSeat):TableView {
  if (![localSeat,focusSeat].every(n=>Number.isInteger(n)&&n>=0&&n<4)) throw new Error('Invalid fixture seat')
  const pool:Tile[]=kinds.flatMap(kind=>Array.from({length:4},(_,i)=>({id:`${kind}:${i}`,kind})))
  const take=(kind:Kind)=>{const i=pool.findIndex(t=>t.kind===kind);if(i<0)throw new Error(`Exhausted ${kind}`);return pool.splice(i,1)[0]}
  const indicators=[take('wan-9')]
  const groups:Kind[][]=[['tiao-1','tiao-2','tiao-3'],['tong-2','tong-2','tong-2'],['wan-5','wan-5','wan-5','wan-5'],['tong-7','tong-7','tong-7','tong-7']]
  const repeated=(k:Kind,n:number)=>Array(n).fill(k) as Kind[]
  const denseGroups:Kind[][][]=[
    [['tiao-1','tiao-2','tiao-3'],repeated('tong-2',3),repeated('wan-5',4),repeated('tong-7',4)],
    [['tiao-4','tiao-5','tiao-6'],repeated('tong-3',3),repeated('wan-6',4),repeated('tong-8',4)],
    [['tiao-7','tiao-8','tiao-9'],repeated('tong-4',3),repeated('wan-7',4),repeated('tong-9',4)],
    [['wan-2','wan-3','wan-4'],repeated('tong-5',3),repeated('wan-8',4),repeated('green',4)],
  ]
  const specials:Kind[][]=name==='specials'
    ? [0,1,2,3].map(seat=>seat===focusSeat?[...repeated('red',4),...repeated('wan-9',3),...repeated('wan-1',4)]:[])
    : name==='melds'
      ? [['red','wan-9','wan-1'],['red','wan-9','wan-1'],['red','wan-9','wan-1'],['red','wan-1']]
      : [['red','wan-9','wan-1'],['red'],['wan-9'],['wan-1']]
  const players=[0,1,2,3].map(seat=>{
    const melds=(name==='melds'?denseGroups[seat]:[groups[seat]]).map((group,index)=>{
      const type=name==='melds'?(index===0?'chi':index===1?'peng':'kong'):(seat===0?'chi':seat===1?'peng':'kong')
      const concealed=name==='melds'?index===3:seat===3
      return {type:type as 'chi'|'peng'|'kong',tiles:group.map(take),concealed,from:concealed?null:(seat+3-(name==='melds'?index%3:0)+4)%4,
        added:name==='melds'&&seat===2&&index===2}
    })
    return {seat,hand:[] as Tile[],concealedTileCount:13-3*melds.length+(seat===localSeat?1:0),melds,
      specialKongs:specials[seat].map(take),discards:[] as Tile[]}
  })
  if (name!=='melds'&&name!=='specials') {
    players[localSeat].hand=['wan-1','wan-2','wan-3','wan-4','wan-6','wan-7','wan-8','wan-9','tong-4','tong-4','red'].map(k=>take(k as Kind))
  }
  // Each fixture is a 136-tile physical allocation, not an impossible screenshot pile.
  for (const p of players) if (!p.hand.length) p.hand=pool.splice(0,p.concealedTileCount)
  for (const p of players) {
    const count=name==='rivers'?(p.seat===focusSeat?24:16):name==='melds'?(p.seat===focusSeat?21:13):3
    p.discards=pool.splice(0,count)
    if(p.discards.length!==count) throw new Error('Fixture over-allocated')
  }
  const all=[...indicators,...players.flatMap(p=>[...p.hand,...p.discards,...p.specialKongs,...p.melds.flatMap(m=>m.tiles)]),...pool]
  if (all.length!==136 || new Set(all.map(t=>t.id)).size!==136) throw new Error('Fixture conservation failed')
  return {version:7,localSeat,turn:localSeat,wallCount:pool.length,indicators,pizi:'wan-9',laizi:'wan-1',players:players.map(p=>({...p,hand:p.seat===localSeat?p.hand:[],melds:p.melds.map(m=>({...m,count:m.tiles.length,tiles:m.concealed&&p.seat!==localSeat?[]:m.tiles}))}))}
}
export function baselinePlayers() {
  // Raw upstream contract, bypasses Macheng adapter; same official components and jade defaults.
  return [0,1,2,3].map(seat=>({name:['本家','下家','对家','上家'][seat],seat,score:0,avatar:`./avatars/${['lotus','ah-lok','shisan','young-master'][seat]}.svg`,
    hand:seat===0?['m1','m2','m3','m4','m5','m6','m7','m8','m9','p2','p3','p4','east','red']:[],concealedTileCount:seat===0?14:13,
    discards:[],melds:[],redCount:0,drawnTileIndex:seat===0?13:-1})) as ReturnType<typeof adapt>['players']
}
