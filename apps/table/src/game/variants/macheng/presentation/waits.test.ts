import {it,expect} from 'vitest'
import {createWaitProjection} from './waits'
import {scenario} from '../fixtures/actionScenarios'
import {playerView,legalActions,evaluateMachengWin,type Meld} from '../core'

it('lists actual v2 completion tiles and counts only visible entities',()=>{
  const {g}=scenario('ting'),view=playerView(g,0),waits=createWaitProjection()(view,0)!
  expect(waits).toBeTruthy();expect(waits.tiles).toContainEqual({tile:'p5',remaining:2})
  expect(waits.tiles.some(t=>t.tile==='east')).toBe(false)
  expect(waits.tiles.some(t=>t.tile==='south')).toBe(true)
  expect(g.players[0].hand).toHaveLength(13)
  const melds=view.players[0].melds as Meld[]
  expect(evaluateMachengWin([...view.players[0].hand.map(t=>t.kind),'tong-5'],melds,view.specials)).toBeTruthy()
})
it('does not invent readiness without opening, allow pizi, or run on 14 tiles/ended state',()=>{
  const s=scenario('ting'),view=playerView(s.g,0),find=createWaitProjection()
  expect(find(playerView(scenario('self-win').g,0),0)).toBeNull()
  expect(find({...view,phase:'ended'},0)).toBeNull()
  const p=structuredClone(view);p.players[0].hand[0]={...p.players[0].hand[0],kind:p.specials.pizi}
  expect(find(p,0)).toBeNull()
  const closed=structuredClone(view);closed.players[0].hand= 'wan-1 wan-2 wan-3 wan-4 wan-5 wan-6 tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 tong-5'.split(' ').map((kind,i)=>({id:String(i),kind:kind as any}))
  expect(find(closed,0)).toBeNull() // Small hand must be opened under this contract.
})
it('unseen count changes with public tiles, never the hidden wall or other private hands',()=>{
  const {g}=scenario('ting'),v=playerView(g,0),find=createWaitProjection(),first=find(v,0)!
  const next=structuredClone(v)
  next.players[2].discards.push({id:'tong-5:3',kind:'tong-5'})
  expect(find(next,0)!.tiles.find(t=>t.tile==='p5')!.remaining).toBe(first.tiles.find(t=>t.tile==='p5')!.remaining-1)
  expect(JSON.stringify(v)).not.toContain('"wall":')
  expect(v.players[1].hand).toEqual([])
})
it('counts an announced add-kong tile once, and does not double-count a river response tile',()=>{
  const {g}=scenario('ting'),v=playerView(g,0),find=createWaitProjection()
  const first=find(v,0)!.tiles.find(t=>t.tile==='p5')!.remaining
  const announced={...v,response:{id:'public',version:v.version,from:1 as const,source:'add-kong' as const,tile:{id:'tong-5:3',kind:'tong-5' as const},submitted:false}}
  expect(find(announced,0)!.tiles.find(t=>t.tile==='p5')!.remaining).toBe(first-1)
  const same=structuredClone(announced);same.players[1].discards.push(same.response.tile)
  expect(find(same,0)!.tiles.find(t=>t.tile==='p5')!.remaining).toBe(first-1)
})
it.each(['self-win','discard-win','rob-kong'])('hu reminder is derived from advertised legal %s actions',name=>{
  const {g,self}=scenario(name)
  expect(legalActions(g,self).some(a=>a.type==='hu')).toBe(true)
})
