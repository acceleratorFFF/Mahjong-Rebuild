import {describe,it,expect} from 'vitest'
import {adapt,face,type Kind} from './adapter'
import {fixedScene,kinds,type SceneName} from './fixtures'
import {denseSingleKongPosition} from '../game/core/presentation/specialKongLayout'
describe('P1 fixed Macheng view → official table contract',()=>{
  it('keeps all 11 dense single-kong bodies inside the live-wall inner boundary without mutual overlap',()=>{
    // Upstream wallLayout: inner x=±6.48, world z=-8.13..4.83; tile layer adds -1 to z.
    for(let seat=0;seat<4;seat++) {
      const boxes=Array.from({length:11},(_,i)=>{
        const p=denseSingleKongPosition(seat,i),halfX=seat%2?.47:.34,halfZ=seat%2?.34:.47
        const b={left:p.x-halfX,right:p.x+halfX,near:p.z-1+halfZ,far:p.z-1-halfZ}
        expect(b.left).toBeGreaterThan(-6.48);expect(b.right).toBeLessThan(6.48)
        expect(b.far).toBeGreaterThan(-8.13);expect(b.near).toBeLessThan(4.83)
        return b
      })
      for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
        const a=boxes[i],b=boxes[j]
        expect(a.right<=b.left||b.right<=a.left||a.near<=b.far||b.near<=a.far).toBe(true)
      }
    }
  })
  it('allocates dense fixtures within 136 tiles at every local seat without leaking hands',()=>{
    for(const name of ['fixed','rivers','melds','specials'] as SceneName[])for(let seat=0;seat<4;seat++) {
      const s=fixedScene(name,seat),r=adapt(s)
      expect(s.wallCount+s.indicators.length+s.players.reduce((n,p)=>n+p.concealedTileCount+p.discards.length+p.specialKongs.length+p.melds.reduce((n,m)=>n+(m.count??m.tiles.length),0),0)).toBe(136)
      expect(s.players[seat].hand).toHaveLength(14-3*s.players[seat].melds.length)
      expect(s.players.filter(p=>p.seat!==seat).every(p=>!p.hand.length)).toBe(true)
      expect(r.ids).toEqual(s.players[seat].hand.map(t=>t.id))
      if(name==='rivers')expect(s.players[seat].discards).toHaveLength(24)
      if(name==='melds')expect(s.players.every(p=>p.melds.length===4)).toBe(true)
      if(name==='specials')expect(s.players[seat].specialKongs).toHaveLength(11)
    }
  })
  it('maps all 34 kinds bijectively and rejects malformed faces',()=>{
    expect(new Set(kinds.map(face)).size).toBe(34)
    expect(['wan-9','tong-2','tiao-3','red'].map(k=>face(k as Kind))).toEqual(['m9','p2','s3','red'])
    expect(()=>face('wan-0' as Kind)).toThrow()
  })
  it('preserves 136 physical tile accounting with a single indicator and separate special kongs',()=>{
    const s=fixedScene(),r=adapt(s)
    expect(s.wallCount+s.indicators.length+s.players.reduce((n,p)=>n+p.concealedTileCount+p.discards.length+p.specialKongs.length+p.melds.reduce((n,m)=>n+(m.count??m.tiles.length),0),0)).toBe(136)
    expect(r.players.map(p=>p.melds.filter(m=>m.type!=='flower').length)).toEqual([1,1,1,1])
    expect(r.players.map(p=>p.melds.filter(m=>m.type==='flower').map(m=>m.tiles.length))).toEqual([[1,1,1],[1],[1],[1]])
    expect(r.players.flatMap(p=>p.melds.filter(m=>m.type==='flower')).every(m=>m.specialSingle)).toBe(true)
    expect(s.players[0].hand).toHaveLength(14-3)
    expect(r.players[0].melds[0].tile).toBe('s3')
  })
  it('strips other hands and hides every face of another seat’s concealed kong',()=>{
    const s=fixedScene(),r=adapt(s)
    expect(s.players.slice(1).every(p=>p.hand.length===0)).toBe(true)
    expect(s.players[3].melds[0].tiles).toEqual([])
    expect(r.players[3].melds[0]).toMatchObject({type:'angang',hidden:true})
    expect(r.players[3].melds[0].tiles).toHaveLength(4)
    expect(r.players.slice(1).map(p=>p.concealedTileCount)).toEqual([10,10,10])
  })
  it('binds intent to exact tile ID/version and rejects invalid index or off-turn discard',()=>{
    const s=fixedScene(),r=adapt(s),before=JSON.stringify(s)
    expect(r.discard(8)).toEqual({type:'discard',tileId:s.players[0].hand[8].id,actor:0,expectedVersion:7})
    expect(r.discard(8).tileId).not.toBe(r.discard(9).tileId)
    for(const i of [-1,11,0.5,NaN])expect(()=>r.discard(i)).toThrow()
    expect(()=>adapt({...s,turn:1}).discard(0)).toThrow()
    expect(JSON.stringify(s)).toBe(before)
  })
  it('rotates absolute seats and source seats together',()=>{
    const s=fixedScene(),r=adapt({...s,localSeat:1,turn:1})
    expect(r.players.map(p=>p.seat)).toEqual([1,2,3,0])
    expect(r.currentPlayer).toBe(0)
    expect(r.players[0].melds[0].from).toBe(3)
  })
})
