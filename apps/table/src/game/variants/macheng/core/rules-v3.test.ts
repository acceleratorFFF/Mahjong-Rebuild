import {it,expect} from 'vitest'
import {applyCommand,assertConservation,evaluateMachengWin,expireGame,legalActions,playerView,replay,type Action,type Game,type Meld,type TileKind} from './index'
import {rig,scenario} from '../fixtures/actionScenarios'
import {createWaitProjection} from '../presentation/waits'
const ks=(s:string)=>s.split(' ') as TileKind[]
const opened:Meld={type:'chi',concealed:false,from:1,tiles:ks('wan-1 wan-2 wan-3').map((kind,i)=>({id:`m${i}`,kind}))}
function submit(g:Game,action:Action){return applyCommand(g,{commandId:`v3-${g.version}`,gameId:g.id,actor:g.turn,expectedVersion:g.pending?.version??g.version,...(g.pending?{windowId:g.pending.id}:{}),action},g.updatedAt+1)}
it.each(['red','east','south'] as TileKind[])('%s discard intent is exactly one tail kong, never a river claim or turn advance',kind=>{
  const g=rig({0:[kind]}),tile=g.players[0].hand.find(t=>t.kind===kind)!,tail=g.wall.at(-1)!,old=JSON.stringify(g)
  const c={commandId:'same-special',gameId:g.id,actor:0 as const,expectedVersion:g.version,action:{type:'discard' as const,tileId:tile.id}}
  const next=applyCommand(g,c,g.updatedAt+1);assertConservation(next)
  expect(JSON.stringify(g)).toBe(old);expect(next.players[0].hand).toHaveLength(14);expect(next.players[0].specialKongs).toEqual([tile]);expect(next.players[0].discards).toEqual([]);expect(next.players[0].melds).toEqual([])
  expect(next.lastDraw).toEqual({seat:0,tileId:tail.id,afterKong:true});expect(next.wall).toEqual(g.wall.slice(0,-1));expect(next.turn).toBe(0);expect(next.pending).toBeNull();expect(next.version).toBe(g.version+1)
  expect(applyCommand(next,c,next.updatedAt+1)).toBe(next);expect(replay(g,next.log)).toEqual(next)
})
it.each(['red','east'] as TileKind[])('retained %s rejects a would-be big win and all corresponding wait reminders',kind=>{
  const g=scenario(kind==='red'?'red-blocked':'pizi-blocked').g
  expect(evaluateMachengWin(g.players[0].hand.map(t=>t.kind),[],g.specials)).toBeNull()
  expect(legalActions(g,0).some(a=>a.type==='hu')).toBe(false)
  expect(()=>submit(g,{type:'hu'})).toThrow('ILLEGAL_ACTION')
  const v=playerView(g,0);v.players[0].hand.pop();v.players[0].handCount--
  expect(createWaitProjection()(v,0)).toBeNull()
})
it.each(['red','east'] as TileKind[])('pizi %s cannot be smuggled through a structural meld',kind=>{
  const meld:Meld={type:'peng',concealed:false,from:1,tiles:[0,1,2].map(i=>({id:`${kind}:${i}`,kind}))}
  const hand=ks('wan-1 wan-1 wan-1 tong-3 tong-3 tong-3 tiao-4 tiao-4 tiao-4 tong-5 tong-5')
  expect(evaluateMachengWin(hand,[meld],{pizi:'east',laizi:'south'})).toBeNull()
})
it.each(['wan','tong','tiao'] as const)('small hand in mixed suits requires a 2/5/8 eye in %s; honors are not small-hand eyes',suit=>{
  for(let rank=1;rank<=9;rank++){
    const eye=`${suit}-${rank}` as TileKind,hand=[...ks('tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9'),eye,eye]
    const result=evaluateMachengWin(hand,[opened],{pizi:'east',laizi:'south'})
    expect(result,eye).toEqual([2,5,8].includes(rank)?{hard:true,pattern:'small'}:null)
  }
  const hand=ks('tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9 north north')
  expect(evaluateMachengWin(hand,[opened],{pizi:'east',laizi:'south'})).toBeNull()
})
it('laizi may still substitute a 258 eye or a sequence; big hands may still use a non-258 eye',()=>{
  const hand=ks('tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9 tong-2 south')
  expect(evaluateMachengWin(hand,[opened],{pizi:'east',laizi:'south'})).toEqual({hard:false,pattern:'small'})
  const big=scenario('big-non258').g
  expect(legalActions(big,0)).toContainEqual({type:'hu'})
  expect(submit(big,{type:'hu'}).result).toMatchObject({type:'win',win:{hard:true,pattern:'pure-suit'}})
})
it.each(['red','east','south'] as TileKind[])('no wall: %s cannot be discarded or konged without a replacement',kind=>{
  const g=rig({0:[kind]}),tile=g.players[0].hand.find(t=>t.kind===kind)!
  g.players[3].discards.push(...g.wall);g.wall=[];assertConservation(g)
  for(const type of ['discard','special-kong'] as const)expect(()=>submit(g,{type,tileId:tile.id})).toThrow('ILLEGAL_ACTION')
  const ordinary=g.players[0].hand.find(t=>!['red','east','south'].includes(t.kind))!
  const next=submit(g,{type:'discard',tileId:ordinary.id});assertConservation(next)
})
it('last replacement can produce a legal laizi-only eye; human may win, but timeout safely draws instead of getting stuck',()=>{
  const melds:Meld[]=['wan-1 wan-2 wan-3','tong-1 tong-2 tong-3','tiao-1 tiao-2 tiao-3','wan-4 wan-5 wan-6'].map(s=>({...opened,tiles:ks(s).map((kind,i)=>({id:String(i),kind}))}))
  const g=rig({0:['red','south']},{0:melds},['south'])
  g.players[3].discards.push(...g.wall.slice(0,-1));g.wall=[g.wall.at(-1)!];assertConservation(g)
  const next=submit(g,{type:'discard',tileId:g.players[0].hand.find(t=>t.kind==='red')!.id})
  expect(next.wall).toEqual([]);expect(legalActions(next,0)).toEqual([{type:'hu'}]);expect(next.result).toBeNull()
  expect(()=>submit(next,{type:'pass'})).toThrow('ILLEGAL_ACTION')
  const won=submit(next,{type:'hu'});expect(won.result).toMatchObject({type:'win',score:{kongCount:1,specialMultiplier:2}});assertConservation(won)
  const expired=expireGame(next,next.deadline);expect(expired.result).toMatchObject({type:'draw',deltas:[0,0,0,0]});assertConservation(expired);expect(replay(g,expired.log)).toEqual(expired)
})
it('direct special discard still qualifies for kong-win scoring and conserves scores',()=>{
  const g=scenario('kong-win').g,red=g.players[0].hand.find(t=>t.kind==='red')!
  const next=submit(g,{type:'discard',tileId:red.id}),end=submit(next,{type:'hu'});assertConservation(end)
  expect(end.result).toMatchObject({type:'win',score:{kongCount:1,specialMultiplier:2}});expect(end.result!.deltas.reduce((a,b)=>a+b,0)).toBe(0)
})
