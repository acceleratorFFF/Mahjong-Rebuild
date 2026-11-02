import {describe,it,expect} from 'vitest'
import {createManualSession} from './manualSession'
import {projectView} from '../presentation/projectView'
import {createFixedGame} from '../fixtures/fixedGame'
import {applyCommand,assertConservation,SEATS,type Command} from '../core'

const command=(session:ReturnType<typeof createManualSession>,tileId='red:0'):Command=>{
  const {view,localSeat}=session.snapshot()
  return {commandId:'test:discard',gameId:view.gameId,actor:localSeat,expectedVersion:view.version,action:{type:'discard',tileId}}
}
describe('P2 manual rule loop',()=>{
  it.each(SEATS)('starts from a legal fixed deal and preserves absolute seat %s',seat=>{
    const game=createFixedGame(seat);assertConservation(game)
    const session=createManualSession({localSeat:seat}),s=session.snapshot(),p=projectView(s)
    expect(s.view.players.map(player=>player.handCount)).toEqual(SEATS.map(n=>n===seat?14:13))
    expect(s.view.remaining).toBe(82);expect(s.view.version).toBe(0)
    expect(s.view.specials).toEqual({pizi:'wan-9',laizi:'wan-1'})
    expect(p.ids.slice(8,10)).toEqual(['tong-4:0','tong-4:1'])
    expect(p.players[0].seat).toBe(seat);expect(p.currentPlayer).toBe(0)
    expect(s.conservation).toEqual({total:136,unique:136,valid:true})
    expect(s.view).not.toHaveProperty('wall');expect(s.view).not.toHaveProperty('log')
    expect(s.view.players.filter((_,n)=>n!==seat).every(p=>p.hand.length===0)).toBe(true)
  })
  it.each(SEATS)('arbitrates an exact red discard as one kong and stays on seat %s',seat=>{
    const session=createManualSession({localSeat:seat}),c=command(session)
    const before=session.snapshot(),receipt=session.submit(c),after=session.snapshot(),mapped=projectView(after)
    expect(receipt).toMatchObject({ok:true,duplicate:false,beforeVersion:0,afterVersion:1})
    expect(after.view.players[seat].handCount).toBe(14)
    expect(after.view.players[seat].hand.some(t=>t.id==='red:0')).toBe(false)
    expect(after.view.players[seat].specialKongs.map(t=>t.id)).toEqual(['red:0'])
    expect(after.view.players[seat].discards).toEqual([])
    expect(after.view.turn).toBe(seat);expect(after.view.phase).toBe('action')
    expect(after.view.remaining).toBe(81);expect(after.wallHeadDrawn).toBe(53)
    expect(mapped.lastDiscard).toBeNull();expect(mapped.isUserTurn).toBe(true)
    expect(after.conservation).toEqual(before.conservation)
    expect(session.submit(c)).toMatchObject({ok:true,duplicate:true,afterVersion:1})
    expect(session.snapshot()).toEqual(after)
    expect(session.discard('forged')).toMatchObject({ok:false,error:'ILLEGAL_ACTION',afterVersion:1})
    expect(session.snapshot()).toEqual(after)
  })
  it('distinguishes same-face entities; mutation of a visible snapshot cannot change the game',()=>{
    const session=createManualSession(),before=session.snapshot()
    before.view.players[0].hand.pop()
    expect(session.snapshot().view.players[0].hand).toHaveLength(14)
    expect(session.discard('tong-4:1')).toMatchObject({ok:true})
    const after=session.snapshot()
    expect(after.view.players[0].hand.map(t=>t.id)).toContain('tong-4:0')
    expect(after.view.players[0].hand.map(t=>t.id)).not.toContain('tong-4:1')
    expect(after.view.players[0].discards.at(-1)?.id).toBe('tong-4:1')
  })
  it('rejects stale, foreign, illegal, colliding and unsupported commands without modifying state',()=>{
    const session=createManualSession(),before=session.snapshot(),c=command(session)
    for(const [input,error] of [
      [{...c,expectedVersion:99},'STALE_VERSION'],
      [{...c,gameId:'wrong'},'WRONG_GAME'],
      [{...c,actor:1},'WRONG_ACTOR'],
      [{...c,action:{type:'discard',tileId:'forged'}},'ILLEGAL_ACTION'],
      [{...c,action:{type:'hu'}},'UNSUPPORTED_ACTION'],
    ] as const){
      expect(session.submit(input as Command)).toMatchObject({ok:false,error,afterVersion:0})
      expect(session.snapshot()).toEqual(before)
    }
    session.submit(c);const after=session.snapshot()
    expect(session.submit({...c,action:{type:'discard',tileId:'tong-4:0'}})).toMatchObject({ok:false,error:'COMMAND_ID_REUSED',afterVersion:1})
    expect(session.snapshot()).toEqual(after)
  })
  it('does not auto-pass another seat’s response or pretend a paused clock has expired',()=>{
    const game=createFixedGame()
    const tile=game.players[0].hand.find(tile=>{
      const c:Command={commandId:'probe',gameId:game.id,actor:0,expectedVersion:0,action:{type:'discard',tileId:tile.id}}
      return applyCommand(game,c,1001).phase==='response'
    })
    expect(tile).toBeDefined()
    const session=createManualSession();session.discard(tile!.id)
    const after=session.snapshot()
    expect(after.view.phase).toBe('response');expect(after.view.response).not.toBeNull()
    expect(session.snapshot()).toEqual(after)
    expect(projectView(after).isUserTurn).toBe(false)
  })
})
