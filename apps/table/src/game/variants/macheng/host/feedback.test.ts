import {it,expect} from 'vitest'
import {applyCommand,assertConservation,expireGame,legalActions,seededRandom,RULE_SET_ID} from '../core'
import {scenario,submit as fixtureSubmit} from '../fixtures/actionScenarios'
import {createLocalSession,actionTicket} from './localSession'
import {projectLocal} from '../presentation/projectLocal'

it('v3 interprets a pizi discard as a single kong at both engine and local host',()=>{
  expect(RULE_SET_ID).toBe('macheng-hongzhong-pizigang-v3')
  const {g,self}=scenario('special-kong'),tile=g.players[self].hand.find(t=>t.kind===g.specials.pizi)!
  const action={type:'discard' as const,tileId:tile.id},before=JSON.stringify(g)
  expect(legalActions(g,self)).toContainEqual(action)
  expect(legalActions(g,self)).toContainEqual({type:'special-kong',tileId:tile.id})
  const next=applyCommand(g,{gameId:g.id,commandId:'pizi-discard-kong',actor:self,expectedVersion:g.version,action},g.updatedAt+1)
  expect(next.players[self].specialKongs).toContainEqual(tile);expect(next.players[self].discards).toEqual([])
  expect(JSON.stringify(g)).toBe(before)
  const s=createLocalSession({idPrefix:'pizi',initialGame:g,localSeat:self,now:()=>1000,random:seededRandom(1)})
  const snap=s.snapshot();expect(s.submit(action,actionTicket(snap.view))).toBe(true)
  expect(s.snapshot().view.version).toBe(snap.view.version+1);expect(s.snapshot().conservation.valid).toBe(true)
})
it('timeout never discards a newly drawn pizi and still preserves all entities',()=>{
  const {g}=scenario('special-kong'),tile=g.players[0].hand.find(t=>t.kind===g.specials.pizi)!
  g.lastDraw={seat:0,tileId:tile.id,afterKong:false}
  const next=expireGame(g,g.deadline)
  expect(next.players[0].discards.every(t=>t.kind!==g.specials.pizi)).toBe(true)
  expect(next.players[0].specialKongs).toContainEqual(tile);assertConservation(next)
})
it('a pizi cannot be retained in a winning structure',()=>{
  const {g}=scenario('self-win');const i=g.wall.findIndex(t=>t.kind==='wan-1')
  const indicator=g.indicators[0];g.indicators[0]=g.wall[i];g.wall[i]=indicator;g.specials={pizi:'wan-1',laizi:'wan-2'}
  assertConservation(g);expect(legalActions(g,0).some(a=>a.type==='hu')).toBe(false)
})
it('pizi-only hand auto-kongs on timeout; the last unreplaceable pizi draw ends without stalling',()=>{
  const only=scenario('pizi-only').g;const actions=legalActions(only,0)
  expect(actions.length).toBeGreaterThan(0);expect(actions.every(a=>a.type==='special-kong'||a.type==='discard')).toBe(true)
  const next=expireGame(only,only.deadline);expect(next.players[0].specialKongs).toHaveLength(1);assertConservation(next)
  const {g,self}=scenario('pizi-last');const ordinary=g.players[self].hand.find(t=>t.kind==='green')!
  const end=fixtureSubmit(g,self,{type:'discard',tileId:ordinary.id})
  expect(end.result?.type).toBe('draw');assertConservation(end)
})
it.each(['self-win','discard-win','rob-kong','draw'])('only terminal %s makes all four hands available to the presentation',name=>{
  const {g,self}=scenario(name);let now=g.updatedAt
  const s=createLocalSession({idPrefix:name,initialGame:g,localSeat:self,now:()=>now,random:seededRandom(1)})
  expect(s.snapshot().roundEndPlayers).toBeNull()
  const before=s.snapshot(),action=before.view.actions.find(a=>a.type===(name==='draw'?'discard':'hu'))!
  expect(s.submit(action,actionTicket(before.view))).toBe(true)
  for(let i=0;i<10&&!s.snapshot().view.result;i++){now+=1000;s.advance()}
  const ended=s.snapshot();expect(ended.view.result).toBeTruthy()
  expect(ended.roundEndPlayers).toHaveLength(4)
  const projected=projectLocal(ended)
  for(const p of projected.players)expect(p.hand.length).toBe(ended.roundEndPlayers![p.seat].handCount)
  expect(s.nextRound()).toBe(true);expect(s.snapshot().roundEndPlayers).toBeNull()
})
