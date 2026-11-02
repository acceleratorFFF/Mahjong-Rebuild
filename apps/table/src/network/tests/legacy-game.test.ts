import { describe, it, expect } from 'vitest';
import { createDeck, type Tile, type TileKind, type Action, type Seat } from '../../game/variants/macheng/core';
import {chooseBotAction} from '../../game/variants/macheng/core/bot';
import { LobbyService } from '../server/lobby';
import type { GameCommand, LobbySnapshot } from '../protocol';
import {parseLobbyCommand} from '../protocol';
import {rig} from '../../game/variants/macheng/fixtures/actionScenarios';
function fixture(humans = 4, seed = 42, deck?: readonly Tile[], totalRounds?:4|8) {
  let now = 1000, serial = 0, state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const service = new LobbyService(() => now, { firstDealer:0, random, ...(deck ? { deck } : {}) });
  const first = service.admit('0', { protocolVersion: 1, commandId: 'create', type: 'create', nickname: '甲' });
  const tokens = [first.token];
  for (let i = 1; i < humans; i++) tokens.push(service.admit(String(i), { protocolVersion: 1, commandId: `join-${i}`,
    type: 'join', nickname: `玩家${i}`, roomCode: first.snapshot.roomCode }).token);
  const roomCommand = (seat: string, op: object) => ({ protocolVersion: 1, commandId: `room-${++serial}`,
    roomId: first.snapshot.roomId, expectedVersion: service.snapshot(seat).version, ...op });
  const sendRoom = (seat: string, op: object) => service.command(seat, roomCommand(seat, op));
  if (humans < 4) sendRoom('0', { type: 'fill-bots' });
  const prepare = () => { for (let i = 1; i < humans; i++) sendRoom(String(i), { type: 'ready', ready: true }); };
  if(totalRounds)sendRoom('0',{type:'configure-match',totalRounds});
  prepare();
  const start = roomCommand('0', { type: 'start' }); service.command('0', start);
  const action = (connection: string, value?: Action): GameCommand => {
    const snap = service.snapshot(connection), view = snap.game!.view;
    const chosen = value ?? chooseBotAction(view, snap.selfSeat);
    if (!chosen) throw new Error('no action');
    return { protocolVersion: 1, commandId: `game-${++serial}`, roomId: snap.roomId, gameId: view.gameId,
      expectedVersion: view.response?.version ?? view.version, ...(view.response ? { windowId: view.response.id } : {}), action: chosen };
  };
  const advance = (ms: number) => { now += ms; };
  function play(): LobbySnapshot {
    for (let step = 0; step < 1600; step++) {
      const snapshot = service.snapshot('0');
      if (snapshot.phase === 'settled') return snapshot;
      let acted = false;
      for (let i = 0; i < humans; i++) {
        const snap = service.snapshot(String(i));
        if (snap.game!.view.actions.length) { service.gameCommand(String(i), action(String(i))); acted = true; break; }
      }
      if (!acted) { advance(500); service.advance(); }
    }
    throw new Error('round did not finish');
  }
  return { service, first, tokens, roomCommand, sendRoom, prepare, start, action, advance, play };
}
describe('authoritative multiplayer round', () => {
  it.each(['cancel-first','auto-first','manual-first'])('autoplay handoff %s leaves no queued action or duplicate entity movement',order=>{
    const g=rig({0:['red','red']}),deck=[...Array.from({length:13},(_,i)=>g.players.map(p=>p.hand[i]!)).flat(),g.players[0].hand[13]!,...g.wall,...g.indicators];
    const f=fixture(4,42,deck),initial=f.service.snapshot('0').game!.view,reds=initial.players[0].hand.filter(t=>t.kind==='red');
    const oldManual=f.action('0',{type:'discard',tileId:reds[0]!.id});
    if(order==='manual-first')f.service.gameCommand('0',oldManual);
    const enable=f.roomCommand('0',{type:'autoplay',enabled:true,gameId:initial.gameId});f.service.command('0',enable);
    f.advance(order==='auto-first'?450:449);
    if(order==='auto-first')f.service.advance();
    f.sendRoom('0',{type:'autoplay',enabled:false,gameId:initial.gameId});
    const cancelled=f.service.snapshot('0'),v=cancelled.game!.view;
    expect(v.version).toBe(initial.version+(order==='cancel-first'?0:1));
    expect(v.turn).toBe(0);expect(cancelled.game!.table.autoplay).toBe(false);
    f.advance(2000);f.service.advance();f.service.advance();
    expect(f.service.snapshot('0').game!.view).toEqual(v);
    expect(f.service.command('0',enable).duplicate).toBe(true);expect(f.service.snapshot('0').game!.table.autoplay).toBe(false);
    if(order==='auto-first')expect(()=>f.service.gameCommand('0',oldManual)).toThrow('STALE_VERSION');
    const tile=v.players[0].hand.find(t=>t.kind==='red')!,manual=f.action('0',{type:'discard',tileId:tile.id});
    const accepted=f.service.gameCommand('0',manual);expect(accepted.duplicate).toBe(false);
    expect(f.service.gameCommand('0',manual).duplicate).toBe(true);
    f.advance(1000);f.service.advance();const after=f.service.snapshot('0');
    expect(after.game!.view.version).toBe(v.version+1);expect(after.game!.view.remaining).toBe(v.remaining-1);
    expect(after.game!.view.players[0].specialKongs.filter(t=>t.id===tile.id)).toHaveLength(1);
    expect(after.game!.table.conservation).toEqual({total:136,unique:136,valid:true});
    for(let i=1;i<4;i++){const other=f.service.snapshot(String(i)).game!.view;expect(other.version).toBe(after.game!.view.version);expect(other.players[0].specialKongs).toEqual(after.game!.view.players[0].specialKongs);expect(other.players[0].hand).toEqual([]);}
  });
  it('two toggle requests at one room version cannot both apply; retrying old enable cannot undo cancel',()=>{
    const f=fixture(),gameId=f.service.snapshot('0').game!.view.gameId,enable=f.roomCommand('0',{type:'autoplay',enabled:true,gameId}),cancel={...enable,commandId:'competing-cancel',enabled:false};
    f.service.command('0',enable);expect(()=>f.service.command('0',cancel)).toThrow('STALE_VERSION');
    f.sendRoom('0',{type:'autoplay',enabled:false,gameId});const stopped=f.service.snapshot('0');
    expect(f.service.command('0',enable).duplicate).toBe(true);expect(f.service.snapshot('0')).toEqual(stopped);
    expect(()=>f.service.command('0',{...enable,enabled:false})).toThrow('COMMAND_ID_REUSED');
  });
  it('cancelled response autoplay cannot submit a late pass or duplicate the subsequent manual response',()=>{
    const g=rig({0:['wan-3'],1:['wan-1','wan-2'],2:['wan-3','wan-3']}),deck=[...Array.from({length:13},(_,i)=>g.players.map(p=>p.hand[i]!)).flat(),g.players[0].hand[13]!,...g.wall,...g.indicators],f=fixture(4,42,deck);
    const id=f.service.snapshot('0').game!.view.players[0].hand.find(t=>t.kind==='wan-3')!.id;
    f.service.gameCommand('0',f.action('0',{type:'discard',tileId:id}));const gameId=f.service.snapshot('1').game!.view.gameId;
    f.sendRoom('1',{type:'autoplay',enabled:true,gameId});f.advance(449);f.sendRoom('1',{type:'autoplay',enabled:false,gameId});f.advance(1000);f.service.advance();
    const before=f.service.snapshot('1').game!.view;expect(before.response!.submitted).toBe(false);
    const pass=f.action('1',{type:'pass'});f.service.gameCommand('1',pass);expect(f.service.gameCommand('1',pass).duplicate).toBe(true);
    const after=f.service.snapshot('1').game!.view;expect(after.version).toBe(before.version+1);expect(after.response!.submitted).toBe(true);
    f.sendRoom('1',{type:'autoplay',enabled:true,gameId});f.advance(500);f.service.advance();expect(f.service.snapshot('1').game!.view).toEqual(after);
    expect(f.service.snapshot('2').game!.view.response!.submitted).toBe(false);
  });
  it('autoplay is bound to the caller, idempotent, refresh-persistent and explicitly cancellable',()=>{
    const f=fixture(),gameId=f.service.snapshot('1').game!.view.gameId,enable=f.roomCommand('1',{type:'autoplay',enabled:true,gameId});
    f.service.command('1',enable);const first=f.service.snapshot('1');expect(first.game!.table.autoplay).toBe(true);expect(f.service.snapshot('0').game!.table.autoplay).toBe(false);
    expect(f.service.command('1',enable).duplicate).toBe(true);expect(f.service.snapshot('1').version).toBe(first.version);
    expect(()=>f.service.command('1',{...enable,commandId:'forged-actor',actor:0})).toThrow('INVALID_MESSAGE');
    expect(()=>f.service.command('1',{...enable,commandId:'wrong-game',expectedVersion:first.version,gameId:'old-game'})).toThrow('WRONG_GAME');
    expect(()=>parseLobbyCommand({...enable,enabled:'true'})).toThrow('INVALID_MESSAGE');
    const resumed=f.service.admit('again1',{protocolVersion:1,commandId:'resume-auto',type:'resume',roomId:first.roomId,token:f.tokens[1]}).snapshot;
    expect(resumed.game!.table.autoplay).toBe(true);expect(resumed.game!.view.players[0].hand).toEqual([]);
    f.sendRoom('again1',{type:'autoplay',enabled:false,gameId});expect(f.service.snapshot('again1').game!.table.autoplay).toBe(false);
    expect(()=>f.service.command('again1',{...enable,commandId:'old-toggle'})).toThrow('STALE_VERSION');
  });
  it('server autoplay rejects new manual actions but still acknowledges an already applied duplicate',()=>{
    const f=fixture(),c=f.action('0');f.service.gameCommand('0',c);
    const gameId=f.service.snapshot('0').game!.view.gameId;f.sendRoom('0',{type:'autoplay',enabled:true,gameId});
    expect(f.service.gameCommand('0',c).duplicate).toBe(true);
    expect(()=>f.service.gameCommand('0',{...c,commandId:'manual-while-auto',expectedVersion:f.service.snapshot('0').game!.view.version})).toThrow('ILLEGAL_ACTION');
  });
  it('discard timeout enters persistent autoplay; a fresh room command can cancel without trusting client time',()=>{
    const f=fixture(),before=f.service.snapshot('0');f.advance(30000);f.service.advance();
    const after=f.service.snapshot('0');expect(after.game!.table.autoplay).toBe(true);expect(after.seats[0]!.autoplay).toBe(true);expect(after.seats[1]!.autoplay).toBe(false);expect(after.game!.view.version).toBeGreaterThan(before.game!.view.version);
    f.sendRoom('0',{type:'autoplay',enabled:false,gameId:after.game!.view.gameId});expect(f.service.snapshot('0').game!.table.autoplay).toBe(false);
  });
  it('response timeout adopts only eligible seats that have not submitted, not a player who already passed',()=>{
    const g=rig({0:['wan-3'],1:['wan-1','wan-2'],2:['wan-3','wan-3']}),deck=[...Array.from({length:13},(_,i)=>g.players.map(p=>p.hand[i]!)).flat(),g.players[0].hand[13]!,...g.wall,...g.indicators];
    const f=fixture(4,42,deck),tile=f.service.snapshot('0').game!.view.players[0].hand.find(t=>t.kind==='wan-3')!;
    f.service.gameCommand('0',f.action('0',{type:'discard',tileId:tile.id}));f.service.gameCommand('1',f.action('1',{type:'pass'}));f.advance(10000);f.service.advance();
    expect(f.service.snapshot('1').game!.table.autoplay).toBe(false);expect(f.service.snapshot('2').game!.table.autoplay).toBe(true);expect(f.service.snapshot('0').game!.table.autoplay).toBe(false);
  });
  it('four server-controlled humans finish exactly one round, settle once and start the next with manual control',()=>{
    const f=fixture(),gameId=f.service.snapshot('0').game!.view.gameId;
    for(let i=0;i<4;i++)f.sendRoom(String(i),{type:'autoplay',enabled:true,gameId});
    for(let i=0;i<1600&&f.service.snapshot('0').phase!=='settled';i++){f.advance(500);f.service.advance();}
    const end=f.service.snapshot('0');expect(end.phase).toBe('settled');expect(end.game!.table.totals).toEqual(end.game!.view.result!.deltas);expect(end.seats.every(p=>!p!.autoplay)).toBe(true);
    const version=end.version;f.service.advance();expect(f.service.snapshot('0').version).toBe(version);
    f.sendRoom('0',{type:'next-round'});expect(f.service.snapshot('0').game!.table.autoplay).toBe(false);
    expect(()=>f.sendRoom('0',{type:'autoplay',enabled:true,gameId})).toThrow('WRONG_GAME');
  });
  it('restores a settled session with all final hands and the same one-time totals',()=>{
    const f=fixture(),end=f.play();f.service.disconnect('1');f.advance(1000);
    const restored=f.service.admit('restored1',{protocolVersion:1,commandId:'terminal-resume',type:'resume',roomId:end.roomId,token:f.tokens[1]}).snapshot;
    expect(restored.phase).toBe('settled');expect(restored.game!.view.gameId).toBe(end.game!.view.gameId);
    expect(restored.game!.table.roundEndPlayers).toEqual(end.game!.table.roundEndPlayers);
    expect(restored.game!.table.totals).toEqual(end.game!.table.totals);
    f.service.advance();expect(f.service.snapshot('restored1').game!.table.totals).toEqual(end.game!.table.totals);
  });
  it('uses v3 on the server: pizi discard is a kong, with one replacement and idempotent retry',()=>{
    const deck=createDeck(),indicator=deck.splice(deck.findIndex(t=>t.kind==='east'),1)[0]!,pizi=deck.splice(deck.findIndex(t=>t.kind==='east'),1)[0]!;
    const f=fixture(4,42,[pizi,...deck,indicator]),before=f.service.snapshot('0').game!.table;
    expect(before.view.players[0].hand.some(t=>t.id===pizi.id)).toBe(true);
    const command=f.action('0',{type:'discard',tileId:pizi.id});f.service.gameCommand('0',command);
    const after=f.service.snapshot('0').game!.table;
    expect(after.view.players[0].specialKongs).toContainEqual(pizi);expect(after.view.players[0].hand).toHaveLength(14);
    expect(after.view.remaining).toBe(before.view.remaining-1);expect(after.conservation.valid).toBe(true);
    expect(after.view.players[0].discards).toEqual([]);expect(after.view.turn).toBe(0);
    expect(f.service.gameCommand('0',command).duplicate).toBe(true);
    expect(f.service.snapshot('0').game!.table).toEqual(after);
  });
  it('hides opponent concealed-kong entity IDs, faces and animation metadata until settlement',()=>{
    const pool=createDeck(),indicator=pool.splice(pool.findIndex(t=>t.kind==='east'),1)[0]!,kong=pool.filter(t=>t.kind==='wan-1');
    for(const t of kong)pool.splice(pool.indexOf(t),1);
    const hands=[ [...kong,...pool.splice(0,9)],pool.splice(0,13),pool.splice(0,13),pool.splice(0,13) ];
    const deck=[...Array.from({length:13},(_,i)=>hands.map(h=>h[i]!)).flat(),...pool,indicator];
    const f=fixture(4,42,deck);f.service.gameCommand('0',f.action('0',{type:'concealed-kong',kind:'wan-1'}));
    const owner=f.service.snapshot('0').game!.table,other=f.service.snapshot('1').game!.table;
    expect(owner.view.players[0].melds[0].tiles).toEqual(kong);
    expect(other.view.players[0].melds[0]).toEqual({type:'kong',concealed:true,count:4,tiles:[]});
    expect(other.presentation.tableAction?.tile).toBe('east');expect(other).toHaveProperty('tableAction.tile','east');
    expect(other.ownDrawnId).toBeNull();for(const t of kong)expect(JSON.stringify(other)).not.toContain(t.id);
  });
  it.each([4, 2])('finishes a seeded round with %i humans, then prepares another round', humans => {
    const f = fixture(humans);
    const initial = f.service.snapshot('0').game!.view.gameId;
    const result = f.play();
    expect(result.game!.view.result).not.toBeNull();
    expect(result.game!.view.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(result.game!.table.totals).toEqual(result.game!.view.result!.deltas);
    expect(result.game!.table.roundEndPlayers).toHaveLength(4);
    const settledTotals=result.game!.table.totals;
    expect(result.seats.filter(p => p && !p.bot).every(p => !p!.ready)).toBe(true);
    const finalVersion = result.version;
    f.service.advance(); f.service.advance();
    expect(f.service.snapshot('0').version).toBe(finalVersion);
    expect(f.service.snapshot('0').game!.table.totals).toEqual(settledTotals);
    const dealer = result.game!.view.result!.nextDealer;
    f.sendRoom('0', { type: 'next-round' });
    expect(()=>f.sendRoom('0',{type:'fill-bots'})).toThrow('WRONG_PHASE');
    const next = f.service.snapshot('0');
    expect(next.game!.round).toBe(2); expect(next.game!.view.dealer).toBe(dealer);
    expect(next.game!.view.gameId).not.toBe(initial);
    expect(next.game!.table.totals).toEqual(settledTotals);
    expect(next.game!.table.roundEndPlayers).toBeNull();
  });
  it('requires the host and all four seats ready before starting', () => {
    const service = new LobbyService(() => 1000);
    const created = service.admit('a', { protocolVersion: 1, commandId: 'create', type: 'create', nickname: '甲' });
    service.admit('b', { protocolVersion: 1, commandId: 'join', type: 'join', nickname: '乙', roomCode: created.snapshot.roomCode });
    const cmd = { protocolVersion: 1, commandId: 'start', type: 'start', roomId: created.snapshot.roomId, expectedVersion: service.snapshot('a').version };
    expect(() => service.command('b', cmd)).toThrow('NOT_HOST');
    expect(() => service.command('a', cmd)).toThrow('NOT_READY');
    expect(service.snapshot('a').game).toBeNull();
  });
  it('retains fixed match membership and totals beyond the old settlement grace period', () => {
    const f = fixture(2); f.service.disconnect('1'); f.advance(60_000); f.service.advance();
    let ended = false;
    for (let step = 0; step < 1500; step++) {
      const snap = f.service.snapshot('0');
      if (snap.phase === 'settled') { ended = true; break; }
      if (snap.game!.view.actions.length&&!snap.game!.table.autoplay) f.service.gameCommand('0', f.action('0'));
      else { f.advance(500); f.service.advance(); }
    }
    expect(ended).toBe(true);
    const settled = f.service.snapshot('0');
    expect(settled.seats[1]?.connected).toBe(false);
    f.advance(60_000);f.service.advance();
    expect(f.service.snapshot('0').seats[1]).not.toBeNull();
    expect(f.service.admit('new1', { protocolVersion: 1, commandId: 'resume', type: 'resume',
      roomId: f.first.snapshot.roomId, token: f.tokens[1] }).snapshot.game!.table.totals).toEqual(settled.game!.table.totals);
    const finalVersion=f.service.snapshot('0').version;
    f.service.advance(); expect(f.service.snapshot('0').version).toBe(finalVersion);
  });
  it('protects private hands and allows only connection-bound legal actions', () => {
    const f = fixture(); const first = f.service.snapshot('0');
    for (let i = 0; i < 4; i++) {
      const wire=f.service.snapshot(String(i)),table=wire.game!.table,view = wire.game!.view;
      expect(table.view).toEqual(view);
      expect(table.roundEndPlayers).toBeNull();
      expect(table.conservation).toEqual({total:136,unique:136,valid:true});
      for(const token of f.tokens)expect(JSON.stringify(wire)).not.toContain(token);
      expect(table.ownDrawnId===null||view.players[i]!.hand.some(t=>t.id===table.ownDrawnId)).toBe(true);
      expect(view.players[i]!.hand.length).toBe(i === 0 ? 14 : 13);
      expect(view.players.filter((_, j) => j !== i).every(p => p.hand.length === 0)).toBe(true);
      for (const field of ['wall', 'log', 'random', 'lastDraw']) expect(view).not.toHaveProperty(field);
    }
    const cmd = f.action('0');
    expect(() => f.service.gameCommand('1', cmd)).toThrow('ILLEGAL_ACTION');
    expect(() => f.service.gameCommand('unknown', cmd)).toThrow('INVALID_SESSION');
    expect(() => f.service.gameCommand('0', { ...cmd, actor: 1 })).toThrow('INVALID_MESSAGE');
    expect(f.service.snapshot('0')).toEqual(first);
  });
  it('makes start and game actions idempotent and rejects stale or changed commands', () => {
    const f = fixture(); const before = f.service.snapshot('0');
    expect(f.service.command('0', f.start).duplicate).toBe(true);
    expect(f.service.snapshot('0')).toEqual(before);
    const cmd = f.action('0'); const first = f.service.gameCommand('0', cmd);
    expect(f.service.gameCommand('0', cmd)).toMatchObject({ duplicate: true, appliedVersion: first.appliedVersion });
    expect(() => f.service.gameCommand('0', { ...cmd, action: { type: 'hu' } })).toThrow('COMMAND_ID_REUSED');
    expect(() => f.service.gameCommand('0', { ...cmd, commandId: 'new', gameId: 'old-game' })).toThrow('WRONG_GAME');
  });
  it('rejects lobby edits and new occupants during an active game', () => {
    const f = fixture(2);
    for (const type of ['ready', 'fill-bots', 'remove-bots', 'start', 'next-round']) {
      expect(() => f.sendRoom('0', { type, ...(type === 'ready' ? { ready: false } : {}) })).toThrow('WRONG_PHASE');
    }
    expect(() => f.service.admit('new', { protocolVersion: 1, commandId: 'new', type: 'join',
      nickname: '新', roomCode: f.first.snapshot.roomCode })).toThrow('WRONG_PHASE');
  });
  it('retains offline seats beyond the lobby grace and resumes with private game state', () => {
    const f = fixture(); f.service.disconnect('0'); f.advance(60_000); f.service.advance();
    const snap = f.service.snapshot('1');
    expect(snap.seats[0]).toMatchObject({ connected: false, autoplay: true });
    const resumed = f.service.admit('new0', { protocolVersion: 1, commandId: 'resume', type: 'resume',
      roomId: f.first.snapshot.roomId, token: f.tokens[0] });
    expect(resumed.snapshot.selfSeat).toBe(0); expect(resumed.snapshot.game).not.toBeNull();
    expect(resumed.snapshot.seats[0]?.autoplay).toBe(true); // Timeout mode persists through refresh/reconnect.
    expect(() => f.service.snapshot('0')).toThrow('INVALID_SESSION');
    f.service.disconnect('0'); expect(f.service.snapshot('new0').seats[0]?.connected).toBe(true);
  });
  it('handles an exact deadline before a late player action without double application', () => {
    const f = fixture(); const cmd = f.action('0');
    f.advance(30_000);
    expect(() => f.service.gameCommand('0', cmd)).toThrow();
    const after = f.service.snapshot('0'); expect(after.game!.view.version).toBeGreaterThan(0);
    f.service.advance();
    expect(f.service.snapshot('0').game!.view.version).toBe(after.game!.view.version);
  });
  it('retains the active match even when all members are absent beyond five minutes', () => {
    const f = fixture(); for (let i = 0; i < 4; i++) f.service.disconnect(String(i));
    f.advance(300_000); f.service.advance();
    expect(f.service.admit('again', { protocolVersion: 1, commandId: 'resume', type: 'resume', roomId: f.first.snapshot.roomId, token: f.tokens[0] }).snapshot.match!.state).toBe('active');
    expect(()=>f.service.admit('new', { protocolVersion: 1, commandId: 'create', type: 'create', nickname: '新' })).toThrow('ROOM_EXISTS');
  });
  it('arbitrates competing wins against one window and settles exactly once', () => {
    const pool = createDeck();
    const take = (kind: TileKind) => {
      const index = pool.findIndex(tile => tile.kind === kind);
      if (index < 0) throw new Error(`exhausted ${kind}`);
      return pool.splice(index, 1)[0]!;
    };
    const indicator = take('east');
    const wait = (kinds: TileKind[]) => [...kinds.flatMap(kind => [take(kind), take(kind), take(kind)]), take('tong-5')];
    const hand1 = wait(['wan-1', 'wan-2', 'tong-3', 'tiao-4']);
    const hand2 = wait(['wan-4', 'wan-5', 'tong-6', 'tiao-7']);
    const extra = take('tong-5');
    const hands = [pool.splice(0, 13), hand1, hand2, pool.splice(0, 13)];
    const deal = Array.from({ length: 13 }, (_, i) => hands.map(hand => hand[i]!)).flat();
    const f = fixture(4, 42, [...deal, extra, ...pool, indicator]);
    f.service.gameCommand('0', f.action('0', { type: 'discard', tileId: extra.id }));
    const first = f.action('1', { type: 'hu' }), second = f.action('2', { type: 'hu' });
    expect(first.expectedVersion).toBe(second.expectedVersion);
    expect(first.windowId).toBe(second.windowId);
    f.service.gameCommand('2', second);
    expect(f.service.snapshot('1').phase).toBe('playing');
    f.service.gameCommand('1', first);
    const third = f.service.snapshot('3');
    if (third.game!.view.actions.some(a => a.type === 'pass')) f.service.gameCommand('3', f.action('3', { type: 'pass' }));
    const settled = f.service.snapshot('1');
    expect(settled.game!.view.result).toMatchObject({ type: 'win', winner: 1 });
    expect(settled.game!.view.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(f.service.gameCommand('1', first).duplicate).toBe(true);
    f.service.advance(); expect(f.service.snapshot('1').version).toBe(settled.version);
  });
});


it.each([4,8] as const)('authoritative room completes exactly %i rounds once and starts a new match only explicitly',n=>{
 const f=fixture(4,42,undefined,n);let expected=[0,0,0,0],firstId=f.service.snapshot('0').match!.id
 for(let i=1;i<=n;i++){
  const end=f.play();expect(end.match!.totalRounds).toBe(n);expect(end.match!.completed).toBe(i);expected=expected.map((x,j)=>x+end.game!.view.result!.deltas[j]);expect(end.match!.totals).toEqual(expected);expect(end.game!.table.totals).toEqual(expected)
  f.service.advance();expect(f.service.snapshot('0').match!.completed).toBe(i)
  if(i<n){f.sendRoom('0',{type:'next-round'});expect(f.service.snapshot('0').phase).toBe('playing');expect(f.service.snapshot('0').game!.table.autoplay).toBe(false)}
 }
 const end=f.service.snapshot('0');expect(end.match!.state).toBe('completed');expect(()=>f.sendRoom('0',{type:'next-round'})).toThrow('MATCH_FINISHED');expect(()=>f.sendRoom('1',{type:'new-match'})).toThrow('NOT_HOST');f.sendRoom('0',{type:'new-match'});expect(f.service.snapshot('0').game).toBeNull();f.prepare();f.sendRoom('0',{type:'start'});const next=f.service.snapshot('0');expect(next.match!.id).not.toBe(firstId);expect(next.match!.completed).toBe(0);expect(next.match!.totals).toEqual([0,0,0,0])
})
it('absence keeps the seat and automatic control; unanimous online-only vote ends between rounds without changing settled scores',()=>{
 const f=fixture();const end=f.play();f.sendRoom('0',{type:'leave'});expect(()=>f.service.snapshot('0')).toThrow('INVALID_SESSION');const before=f.service.snapshot('1');expect(before.seats[0]).toMatchObject({connected:false,autoplay:true});expect(before.match!.totals).toEqual(end.match!.totals);expect(()=>f.service.admit('outsider',{protocolVersion:1,type:'join',commandId:'steal-seat',nickname:'新人',roomCode:f.first.snapshot.roomCode})).toThrow('WRONG_PHASE')
 f.sendRoom('1',{type:'end-request'});const vote=f.service.snapshot('1').match!.vote!;expect(vote.eligible).toEqual([1,2,3]);expect(f.service.snapshot('1').canStart).toBe(false);f.sendRoom('2',{type:'end-vote',voteId:vote.id,agree:true});expect(f.service.snapshot('1').match!.state).toBe('active');f.sendRoom('3',{type:'end-vote',voteId:vote.id,agree:true});const final=f.service.snapshot('1');expect(final.match!.state).toBe('early');expect(final.match!.completed).toBe(1);expect(final.match!.totals).toEqual(end.match!.totals)
})
it('owner can end only between rounds and a returning owner invalidates the old vote electorate',()=>{
 const f=fixture();expect(()=>f.sendRoom('0',{type:'end-request'})).toThrow('WRONG_PHASE');f.play();expect(()=>f.sendRoom('1',{type:'end-request'})).toThrow('NOT_HOST');f.service.disconnect('0');f.sendRoom('1',{type:'end-request'});const vote=f.service.snapshot('1').match!.vote!;f.service.admit('restored',{protocolVersion:1,commandId:'owner-back',type:'resume',roomId:f.first.snapshot.roomId,token:f.tokens[0]});expect(f.service.snapshot('restored').match!.vote).toBeNull();expect(()=>f.sendRoom('2',{type:'end-vote',voteId:vote.id,agree:true})).toThrow('VOTE_EXPIRED');f.sendRoom('restored',{type:'end-request'});expect(f.service.snapshot('restored').match!.state).toBe('early')
})

it('settlement-page disconnect cannot carry temporary autoplay into the next round',()=>{
 const f=fixture();f.play();f.sendRoom('0',{type:'leave'});const r=f.service.admit('again0',{protocolVersion:1,commandId:'between-round-return',type:'resume',roomId:f.first.snapshot.roomId,token:f.tokens[0]}).snapshot;expect(r.game!.table.autoplay).toBe(true);const host=String(r.hostSeat);f.sendRoom(host,{type:'next-round'});for(const c of ['again0','1','2','3'])expect(f.service.snapshot(c).game!.table.autoplay).toBe(false)
})

it('fast passive refresh preserves manual control while explicit temporary leave enables autoplay',()=>{
 const f=fixture(),initial=f.service.snapshot('0');f.service.disconnect('0');const restored=f.service.admit('refreshed0',{protocolVersion:1,commandId:'refresh-manual',type:'resume',roomId:f.first.snapshot.roomId,token:f.tokens[0]}).snapshot;expect(restored.game!.table.autoplay).toBe(false);expect(restored.game!.view).toEqual(initial.game!.view);f.sendRoom('refreshed0',{type:'leave'});const returned=f.service.admit('returned0',{protocolVersion:1,commandId:'return-away',type:'resume',roomId:f.first.snapshot.roomId,token:f.tokens[0]}).snapshot;expect(returned.game!.table.autoplay).toBe(true);expect(returned.match!.id).toBe(initial.match!.id);expect(returned.game!.view).toEqual(initial.game!.view)
})

it('fixed roster cannot be changed through bot controls between rounds; final disconnection retains the result',()=>{
 const f=fixture(2);f.play();expect(()=>f.sendRoom('0',{type:'remove-bots'})).toThrow('WRONG_PHASE');expect(f.service.snapshot('0').seats.filter(Boolean)).toHaveLength(4);f.sendRoom('0',{type:'end-request'});const result=f.service.snapshot('0').match;f.service.disconnect('1');f.advance(60000);expect(f.service.snapshot('0').seats[1]).not.toBeNull();expect(f.service.admit('back1',{protocolVersion:1,commandId:'final-back',type:'resume',roomId:f.first.snapshot.roomId,token:f.tokens[1]}).snapshot.match).toEqual(result)
})

it('one host continuation starts the next round once without readiness and preserves offline autoplay and score',()=>{
 const f=fixture(),end=f.play(),gameId=end.game!.view.gameId;f.service.disconnect('3');
 expect(()=>f.sendRoom('1',{type:'next-round'})).toThrow('NOT_HOST');
 const request=f.roomCommand('0',{type:'next-round'});f.service.command('0',request);const next=f.service.snapshot('0');
 expect(next.phase).toBe('playing');expect(next.game!.round).toBe(2);expect(next.game!.view.gameId).not.toBe(gameId);expect(next.match!.totals).toEqual(end.match!.totals);expect(next.match!.completed).toBe(1);expect(next.seats[3]).toMatchObject({connected:false,autoplay:true});expect(next.game!.table.autoplay).toBe(false);
 expect(f.service.command('0',request).duplicate).toBe(true);expect(f.service.snapshot('0').game!.view.gameId).toBe(next.game!.view.gameId);
 expect(()=>f.sendRoom('0',{type:'next-round'})).toThrow('WRONG_PHASE');expect(()=>f.sendRoom('1',{type:'ready',ready:true})).toThrow('WRONG_PHASE');
 const restored=f.service.admit('returned3',{protocolVersion:1,commandId:'restore-offline-next',type:'resume',roomId:f.first.snapshot.roomId,token:f.tokens[3]}).snapshot;expect(restored.game!.table.autoplay).toBe(true);
})
it('pending early-end vote blocks continuation; rejection allows the current host to continue directly',()=>{
 const f=fixture();f.play();f.service.disconnect('0');f.sendRoom('1',{type:'end-request'});const vote=f.service.snapshot('1').match!.vote!;
 expect(()=>f.sendRoom('1',{type:'next-round'})).toThrow('NOT_READY');f.sendRoom('2',{type:'end-vote',voteId:vote.id,agree:false});f.sendRoom('1',{type:'next-round'});expect(f.service.snapshot('1').game!.round).toBe(2);
})
