import {it,expect} from 'vitest'
import {scenario} from '../fixtures/actionScenarios'
import {createLocalSession} from './localSession'
import {projectLocal} from '../presentation/projectLocal'
import {tileMarkerFor} from '../../../../components/table/three/tileMarker'
import {seededRandom} from '../core'
it('only pizi single-kong choices suppress the button, while discard intent stays legal and other kongs remain visible',()=>{
  for(const name of ['pizi-single','laizi-single','special-only','special-kong','concealed-kong','add-kong','exposed-kong']){
    const {g,self}=scenario(name),s=createLocalSession({idPrefix:name,initialGame:g,localSeat:self,now:()=>1000,random:seededRandom(1)}).snapshot(),p=projectLocal(s)
    expect(p.userKongs.length>0).toBe(['special-kong','concealed-kong','add-kong'].includes(name));if(name==='exposed-kong')expect(p.prompt?.canGang).toBe(true)
    if(name==='pizi-single')expect(p.actions.some(a=>a.type==='discard'&&a.tileId===g.players[0].hand.find(t=>t.kind==='east')!.id)).toBe(true)
  }
})
it('Macheng public-face markers keep the same role on any face, independently of the legacy joker semantics',()=>{
  const specials={pizi:'east' as const,laizi:'south' as const}
  expect(tileMarkerFor('red',[],[],specials)).toBe('pizi');expect(tileMarkerFor('east',[],[],specials)).toBe('pizi');expect(tileMarkerFor('south',[],[],specials)).toBe('laizi');expect(tileMarkerFor('m1',[],[],specials)).toBe(false)
  expect(tileMarkerFor('red')).toBe(false);expect(tileMarkerFor('white',['white'])).toBe('laizi')
})
it.each(['pizi-single','peng'])('local unsubmitted %s timeout enters cancellable autoplay',name=>{
  const {g,self}=scenario(name);let now=g.updatedAt
  const s=createLocalSession({idPrefix:name,initialGame:g,localSeat:self,now:()=>now,random:seededRandom(2)})
  expect(s.snapshot().autoplay).toBe(false);now=g.deadline;s.advance();expect(s.snapshot().autoplay).toBe(true);s.setAutoplay(false);expect(s.snapshot().autoplay).toBe(false)
})
