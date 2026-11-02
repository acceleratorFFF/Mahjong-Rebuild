import {it,expect} from 'vitest'
import {createLocalSession,actionTicket} from './localSession'
import {scenario} from '../fixtures/actionScenarios'
import {chooseBotAction} from '../core/bot'
import {seededRandom,type Action} from '../core'
import {projectLocal} from '../presentation/projectLocal'

function fixture(name:string){
  let now=0;const {g,self}=scenario(name)
  const session=createLocalSession({initialGame:g,localSeat:self,idPrefix:name,random:seededRandom(42),now:()=>now,botDelay:450})
  return {session,step:(ms=500)=>{now+=ms;return session.advance()},self}
}
function choose(s:ReturnType<typeof createLocalSession>,type:Action['type']){
  const snap=s.snapshot(),action=snap.view.actions.find(a=>a.type===type);expect(action).toBeTruthy()
  expect(s.submit(action!,actionTicket(snap.view))).toBe(true)
}
function checked(s:ReturnType<typeof createLocalSession>){
  const snap=s.snapshot();expect(snap.conservation).toEqual({total:136,unique:136,valid:true})
  for(let i=0;i<4;i++)if(i!==snap.localSeat){expect(snap.view.players[i].hand).toEqual([]);for(const m of snap.view.players[i].melds)if(m.concealed)expect(m.tiles).toEqual([])}
  expect(snap.view).not.toHaveProperty('wall');expect(snap.view).not.toHaveProperty('log')
  return snap
}
it.each(['chi','peng','exposed-kong','concealed-kong','add-kong','special-kong','pass'] as const)('official legal %s transfers entities once and displays replacement counts',name=>{
  const {session:s,step,self}=fixture(name),before=checked(s),ticket=actionTicket(before.view)
  const action=before.view.actions.find(a=>a.type===name)!
  expect(s.submit(action,ticket)).toBe(true)
  for(let n=0;n<4&&s.snapshot().view.phase==='response';n++)step()
  const after=checked(s),p=after.view.players[self]
  expect(s.submit(action,ticket)).toBe(false)
  if(name==='chi'||name==='peng')expect(p.handCount).toBe(before.view.players[self].handCount-2)
  if(name==='exposed-kong'||name==='concealed-kong')expect(p.handCount).toBe(before.view.players[self].handCount-(name==='exposed-kong'?2:3))
  if(name==='add-kong'||name==='special-kong')expect(p.handCount).toBe(before.view.players[self].handCount)
  if(name!=='pass'){
    const m=projectLocal(after);expect(m.tableActionEvent).not.toBeNull()
    if(name==='special-kong')expect(p.specialKongs).toHaveLength(1)
    else expect(p.melds[0].tiles).toHaveLength(name==='chi'||name==='peng'?3:4)
  }
})
it.each(['self-win','discard-win','rob-kong','kong-win'])('%s pays core score once and starts next dealer',name=>{
  const {session:s,step}=fixture(name)
  if(name==='kong-win'){
    const snap=s.snapshot();choose(s,'special-kong');expect(s.snapshot().view.remaining).toBe(snap.view.remaining-1)
  }
  choose(s,'hu');for(let n=0;n<4&&!s.snapshot().view.result;n++)step()
  const ended=checked(s);expect(ended.view.result?.type).toBe('win')
  if(ended.view.result?.type!=='win')throw Error('expected win')
  expect(ended.totals).toEqual(ended.view.result.deltas);expect(ended.totals.reduce((a,b)=>a+b,0)).toBe(0)
  const m=projectLocal(ended);expect(m.result!.totalMultiplier).toBe(ended.view.result.score.payment)
  expect(m.result!.scoreChanges!.map(p=>p.delta).reduce((a,b)=>a+b,0)).toBe(0)
  step(60000);expect(s.snapshot().totals).toEqual(ended.totals)
  expect(s.nextRound()).toBe(true);expect(s.snapshot().view.dealer).toBe(ended.view.result.nextDealer)
  expect(s.snapshot().round).toBe(2);expect(s.snapshot().totals).toEqual(ended.totals)
})
it('response expires at 10s and human choice uses window version after another bot responds',()=>{
  const {session:s,step}=fixture('peng'),before=s.snapshot(),ticket=actionTicket(before.view)
  step(500);const changed=s.snapshot();expect(changed.view.response?.id).toBe(before.view.response?.id)
  expect(s.submit({type:'peng'},ticket)).toBe(true)
  const expired=fixture('peng');expired.step(10000)
  expect(expired.session.snapshot().view.response?.id).not.toBe(before.view.response?.id)
  expect(expired.session.snapshot().view.actions.some(a=>a.type==='peng')).toBe(false)
})
it('table loading holds the clock, then humans can play a complete normal game against three bots',()=>{
  let now=0;const s=createLocalSession({idPrefix:'human',dealer:0,random:seededRandom(7),now:()=>now,waitForReady:true})
  now=90000;expect(s.advance()).toBe(false);expect(s.snapshot().now).toBe(0);s.startReady()
  let steps=0,manual=0
  while(!s.snapshot().view.result&&steps++<600){
    const snap=checked(s),action=chooseBotAction(snap.view,snap.localSeat)
    if(action){expect(s.submit(action,actionTicket(snap.view))).toBe(true);manual++}
    now+=500;s.advance()
  }
  expect(steps).toBeLessThan(600);expect(manual).toBeGreaterThan(10);expect(checked(s).view.result).toBeTruthy()
})
it('a duplicate command is idempotent and a reused ID with another tile is rejected',()=>{
  const {session:s}=fixture('concealed-kong'),snap=s.snapshot(),tile=snap.view.players[0].hand[0]
  const c={commandId:'same',gameId:snap.view.gameId,actor:0 as const,expectedVersion:snap.view.version,action:{type:'discard' as const,tileId:tile.id}}
  expect(s.submitCommand(c)).toBe(true);const next=s.snapshot();expect(s.submitCommand(c)).toBe(true)
  expect(s.snapshot()).toEqual(next);expect(s.submitCommand({...c,action:{type:'discard',tileId:'missing'}})).toBe(false)
})
it('a bot peng beats human chi; the original window ticket remains valid after the bot response',()=>{
  const {session:s,step}=fixture('competition'),before=s.snapshot(),ticket=actionTicket(before.view)
  const chi=before.view.actions.find(a=>a.type==='chi')!;expect(chi).toBeTruthy()
  expect(step()).toBe(true);expect(s.snapshot().view.version).toBeGreaterThan(before.view.version)
  expect(s.snapshot().view.response!.version).toBe(ticket.version)
  expect(s.submit(chi,ticket)).toBe(true);const after=checked(s)
  expect(after.view.players[1].melds).toHaveLength(0);expect(after.view.players[2].melds[0].type).toBe('peng')
})
it('two hu responses settle once to the nearer claimant regardless of response order',()=>{
  const {session:s,step}=fixture('multi-hu');step();choose(s,'hu')
  for(let n=0;n<4&&!s.snapshot().view.result;n++)step()
  const r=checked(s).view.result;expect(r?.type).toBe('win');if(r?.type==='win')expect(r.winner).toBe(1)
})
it('the last discard ends in zero-payment draw and the dealer stays for the next round',()=>{
  const {session:s,step}=fixture('draw');expect(s.snapshot().view.remaining).toBe(0);choose(s,'discard')
  step(10000);const end=checked(s);expect(end.view.result?.type).toBe('draw');expect(end.totals).toEqual([0,0,0,0])
  expect(s.nextRound()).toBe(true);expect(s.snapshot().view.dealer).toBe(end.view.dealer)
})
