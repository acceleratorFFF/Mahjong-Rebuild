import { createDeck, seededRandom, createGame, legalActions, applyCommand, playerView, assertConservation, SEATS, type TileKind, type Game, type Seat, type Action, type Meld, type Command } from '../core';
const kinds = (s: string) => s.split(' ') as TileKind[];
const repeat = (kind: TileKind, n: number) => Array<TileKind>(n).fill(kind);
const meld = (s: string, type: Meld['type'] = 'chi', concealed = false): Meld => ({ type, concealed, from: concealed ? null : 0, tiles: kinds(s).map((kind, i) => ({ kind, id: `test:${i}` })) });
const newGame = (seed = 42) => createGame({ id: `game-${seed}`, dealer: 0 }, { random: seededRandom(seed), now: () => 1000 });
function command(g: Game, actor: Seat, action: Action, id = `c${g.version}`): Command {
  return { gameId: g.id, commandId: id, actor, expectedVersion: g.pending?.version ?? g.version, ...(g.pending ? { windowId: g.pending.id } : {}), action };
}
function act(g: Game, actor: Seat, action: Action): Game { return applyCommand(g, command(g, actor, action), g.updatedAt + 1); }
function discard(g: Game, kind: TileKind) { return act(g, g.turn, { type: 'discard', tileId: g.players[g.turn].hand.find(t => t.kind === kind)!.id }); }
function passes(g: Game): Game {
  const eligible = g.pending?.eligible.slice() ?? [];
  for (const seat of eligible) if (g.phase === 'response' && !g.pending!.responses[seat]) g = act(g, seat, { type: 'pass' });
  return g;
}
// Trusted fixture builder allocates every real tile once, then fills unspecified
// hands; it cannot create a fifth copy or duplicate an entity ID.
export function rig(hands: Partial<Record<Seat, TileKind[]>>, melds: Partial<Record<Seat, Meld[]>> = {}, tail: TileKind[] = []): Game {
  const g = newGame(); const pool = createDeck();
  const take = (kind: TileKind) => { const i = pool.findIndex(t => t.kind === kind); if (i < 0) throw new Error(`fifth ${kind}`); return pool.splice(i, 1)[0]!; };
  g.indicators = [take('east')]; g.specials = { pizi: 'east', laizi: 'south' };
  for (const seat of SEATS) { g.players[seat] = { hand: [], melds: [], specialKongs: [], discards: [] }; }
  for (const seat of SEATS) {
    g.players[seat].melds = (melds[seat] ?? []).map(m => ({ ...m, tiles: m.tiles.map(t => take(t.kind)) }));
    g.players[seat].hand = (hands[seat] ?? []).map(take);
  }
  const reserved = tail.map(take);
  for (const seat of SEATS) while (g.players[seat].hand.length < (seat === 0 ? 14 : 13) - g.players[seat].melds.length * 3) g.players[seat].hand.push(pool.pop()!);
  g.wall = [...pool, ...reserved]; g.lastDraw = { seat: 0, tileId: g.players[0].hand.at(-1)!.id, afterKong: false };
  assertConservation(g); return g;
}
const waiting1 = [...repeat('wan-1', 3), ...repeat('wan-2', 3), ...repeat('tong-3', 3), ...repeat('tiao-4', 3), 'tong-5'] as TileKind[];


export function scenario(name:string) {
 let self:Seat=0, g:Game;
 if(name==='pizi-only'||name==='pizi-last'){
  g=rig({0:name==='pizi-only'?['east','east']:['east','green']},{0:[meld('wan-1 wan-2 wan-3'),meld('tong-1 tong-2 tong-3'),meld('tiao-1 tiao-2 tiao-3'),meld('wan-4 wan-5 wan-6')]},['east']);
  if(name==='pizi-last'){
   const ordinary=g.players[0].hand.splice(g.players[0].hand.findIndex(t=>t.kind==='green'),1)[0];g.players[3].hand.push(ordinary);
   g.players[2].discards.push(...g.wall.slice(0,-1));g.wall=[g.wall.at(-1)!];g.turn=3;self=3;g.lastDraw={seat:3,tileId:ordinary.id,afterKong:false};
  }
 }else if(name==='draw'){
  // Reach the last draw through the same engine, passing responses and never declaring hu.
  g=newGame(42);let steps=0;
  while(g.wall.length>0&&steps++<500){
   if(g.phase==='response')g=passes(g);
   else g=act(g,g.turn,legalActions(g,g.turn).find(a=>a.type==='discard')!);
  }
  if(g.phase!=='action'||g.wall.length!==0)throw new Error('terminal fixture not reached');self=g.turn;
 }else if(name==='special-only'){
  g=rig({0:kinds('red east south wan-1 wan-2 wan-3 wan-4 wan-6 wan-7 wan-8 wan-9 tong-4 tiao-2 tiao-5')});
 }else if(name==='pizi-single'||name==='laizi-single'){
  g=rig({0:kinds((name==='laizi-single'?'south':'east')+' wan-1 wan-2 wan-3 wan-4 wan-6 wan-7 wan-8 wan-9 tong-4 tong-4 tiao-2 tiao-5 tiao-8')});
 }else if(name==='red-blocked'||name==='pizi-blocked'){
  g=rig({0:[...waiting1.map(k=>k==='wan-2'?(name==='red-blocked'?'red':'east'):k),'tong-5']});
 }else if(name==='small-258'||name==='small-not-258'){
  g=rig({0:kinds(`tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9 ${name==='small-258'?'tong-2 tong-2':'tong-1 tong-1'}`)},{0:[meld('wan-1 wan-2 wan-3')]});
 }else if(name==='big-non258'){
  g=rig({0:kinds('wan-1 wan-2 wan-3 wan-2 wan-3 wan-4 wan-4 wan-5 wan-6 wan-7 wan-8 wan-9 wan-1 wan-1')});
 }else if(name==='competition'){
  g=discard(rig({0:['wan-3'],1:['wan-1','wan-2'],2:['wan-3','wan-3']}),'wan-3');self=1;
 }else if(name==='multi-hu'){
  g=discard(rig({0:['tong-5'],1:waiting1,2:[...repeat('wan-4',3),...repeat('wan-5',3),...repeat('tong-6',3),...repeat('tiao-7',3),'tong-5']}),'tong-5');self=1;
 }else if(['chi','peng','exposed-kong','pass'].includes(name)){
  g=rig({0:['wan-3'],1:['wan-1','wan-2','wan-3','wan-3','wan-3','wan-4','wan-5']});
  g=discard(g,'wan-3');self=1;
 } else if(name==='concealed-kong')g=rig({0:repeat('wan-6',4)});
 else if(name==='add-kong')g=rig({0:['tong-7']},{0:[meld('tong-7 tong-7 tong-7','peng')]});
 else if(name==='discard-win'){g=discard(rig({0:['tong-5'],1:waiting1}),'tong-5');self=1;}
 else if(name==='rob-kong'){
  g=rig({0:['tong-7'],1:kinds('tong-5 tong-6 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9 tong-2 tong-2')},
   {0:[meld('tong-7 tong-7 tong-7','peng')],1:[meld('wan-1 wan-2 wan-3')]});
  g=act(g,0,legalActions(g,0).find(a=>a.type==='add-kong')!);self=1;
 } else if(name==='ting')g=discard(rig({0:[...waiting1,'tong-5']}),'tong-5');
 else if(name==='self-win')g=rig({0:[...waiting1,'tong-5']});
 else if(name==='kong-win')g=rig({0:[...waiting1,'red']},{},['tong-5']);
 else g=rig({0:['red','east','south']});
 return {g,self};
}
export function submit(g:Game,self:Seat,action:Action){
 g=act(g,self,action);g=passes(g);assertConservation(g);return g;
}
export {playerView};
