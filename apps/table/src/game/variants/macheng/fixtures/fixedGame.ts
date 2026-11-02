import {createDeck,createGame,seededRandom,shuffle,type Seat,type TileKind} from '../core'

// A legal deterministic opening, NOT a screenshot state assembled after the fact.
// Round-robin dealing and the tail indicator are still performed by createGame.
export function createFixedGame(dealer:Seat=0,now:()=>number=()=>1000) {
  const pool=createDeck()
  const take=(kind:TileKind)=>{
    const index=pool.findIndex(tile=>tile.kind===kind)
    if(index<0)throw new Error(`Fixed deck exhausted ${kind}`)
    return pool.splice(index,1)[0]!
  }
  const own:TileKind[]=['wan-1','wan-2','wan-3','wan-4','wan-6','wan-7','wan-8','wan-9','tong-4','tong-4','tiao-2','tiao-5','tiao-8','red']
  const hand=own.map(take),indicator=take('wan-9')
  const rest=shuffle(pool,seededRandom(20261025))
  const others=[rest.splice(0,13),rest.splice(0,13),rest.splice(0,13)]
  const deck=[]
  for(let i=0;i<13;i++)deck.push(hand[i],...others.map(other=>other[i]))
  deck.push(hand[13],...rest,indicator)
  return createGame({id:`macheng-p2-fixed-seat-${dealer}`,dealer,deck},{random:seededRandom(20261025),now})
}
