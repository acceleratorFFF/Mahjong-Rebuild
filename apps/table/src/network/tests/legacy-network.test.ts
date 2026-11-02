import { seededRandom, createDeck, type Tile, type TileKind } from '../../game/variants/macheng/core';
import {chooseBotAction} from '../../game/variants/macheng/core/bot';
import { afterEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createNetworkServer, allowedOrigins, type NetworkOptions } from '../server/network';
import type { AdmissionData, CommandData, LobbySnapshot, Reply } from '../protocol';
const origin = 'http://127.0.0.1:5173';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });
async function fixture(limits: NetworkOptions['limits'] = {}, deck?: readonly Tile[]) {
  let now = 1000;
  let next = 0;
  const app = createNetworkServer({allowGuestForTests:true, origins: [origin], now: () => now, roundOptions: { firstDealer:0, random: seededRandom(42), ...(deck ? { deck } : {}) }, limits: { sweepMs: 10, ...limits } });
  const clients: Socket[] = [];
  cleanups.push(async () => { clients.forEach(client => client.disconnect()); await app.close(); });
  await new Promise<void>(resolve => app.http.listen(0, '127.0.0.1', resolve));
  const address = app.http.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const base = `http://127.0.0.1:${address.port}`;
  function client(transport = 'websocket', clientOrigin: string | null = origin): Socket {
    const socket = io(base, { transports: [transport], autoConnect: false, forceNew: true,
      reconnection: false, timeout: 1000, ...(clientOrigin === null ? {} : { extraHeaders: { Origin: clientOrigin } }) });
    clients.push(socket); return socket;
  }
  async function connect(transport = 'websocket'): Promise<Socket> {
    const socket = client(transport);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
    return socket;
  }
  const admit = (socket: Socket, type: 'create' | 'join', roomCode?: string) => send<AdmissionData>(socket, 'lobby:admit', {
    protocolVersion: 1, commandId: `admit-${++next}`, type, nickname: `玩家${next}`, ...(roomCode ? { roomCode } : {}),
  });
  const sync = async (socket: Socket) => unwrap(await send<LobbySnapshot>(socket, 'lobby:sync', { protocolVersion: 1 }));
  async function command(socket: Socket, operation: object) {
    const view = await sync(socket);
    return { protocolVersion: 1, commandId: `cmd-${++next}`, roomId: view.roomId, expectedVersion: view.version, ...operation };
  }
  return { app, base, client, connect, admit, sync, command, advance: (ms: number) => { now += ms; } };
}
function send<T>(socket: Socket, event: string, input: unknown): Promise<Reply<T>> {
  return new Promise((resolve, reject) => socket.timeout(1500).emit(event, input,
    (error: Error | null, reply: Reply<T>) => error ? reject(error) : resolve(reply)));
}
function unwrap<T>(reply: Reply<T>): T { if (reply.ok === false) throw new Error(reply.error); return reply.data; }
function disconnected(socket: Socket): Promise<void> { return new Promise(resolve => socket.once('disconnect', () => resolve())); }
function denied(socket: Socket): Promise<Error> {
  return new Promise((resolve, reject) => { socket.once('connect_error', resolve); socket.once('connect', () => reject(new Error('unexpected connection'))); socket.connect(); });
}

describe('real Socket.IO room transport', () => {
  it('wire autoplay is own-session only, refresh-persistent, cancellable and activated by a server timeout',async()=>{
    const f=await fixture(),a=await f.connect(),created=unwrap(await f.admit(a,'create')),b=await f.connect();unwrap(await f.admit(b,'join',created.snapshot.roomCode));
    unwrap(await send(a,'lobby:command',await f.command(a,{type:'fill-bots'})));for(const s of [a,b])unwrap(await send(s,'lobby:command',await f.command(s,{type:'ready',ready:true})));unwrap(await send(a,'lobby:command',await f.command(a,{type:'start'})));
    const initial=await f.sync(a),gameId=initial.game!.view.gameId,c=await f.command(a,{type:'autoplay',enabled:true,gameId});
    expect(unwrap(await send<CommandData>(a,'lobby:command',c)).snapshot!.game!.table.autoplay).toBe(true);expect(unwrap(await send<CommandData>(a,'lobby:command',c)).duplicate).toBe(true);
    expect((await f.sync(b)).game!.table.autoplay).toBe(false);
    expect(await send(a,'lobby:command',{...c,commandId:'forged-seat',seat:1})).toMatchObject({ok:false,error:'INVALID_MESSAGE'});
    const restored=await f.connect();const admission=unwrap(await send<AdmissionData>(restored,'lobby:admit',{protocolVersion:1,commandId:'restore-auto',type:'resume',roomId:initial.roomId,token:created.token}));expect(admission.snapshot.game!.table.autoplay).toBe(true);
    unwrap(await send(restored,'lobby:command',await f.command(restored,{type:'autoplay',enabled:false,gameId})));expect((await f.sync(restored)).game!.table.autoplay).toBe(false);
    f.advance(30000);expect((await f.sync(restored)).game!.table.autoplay).toBe(true);
    unwrap(await send(restored,'lobby:command',await f.command(restored,{type:'autoplay',enabled:false,gameId})));expect((await f.sync(restored)).game!.table.autoplay).toBe(false);
  });
  it.each(['red','east','south'] as TileKind[])('v3 wire discard of %s is one tail kong, retry cannot add a second kong',async kind=>{
    const pool=createDeck(),indicator=pool.splice(pool.findIndex(t=>t.kind==='east'),1)[0]!,tile=pool.splice(pool.findIndex(t=>t.kind===kind),1)[0]!,deck=[tile,...pool,indicator];
    const f=await fixture({},deck),a=await f.connect(),created=unwrap(await f.admit(a,'create')),b=await f.connect();unwrap(await f.admit(b,'join',created.snapshot.roomCode));
    unwrap(await send(a,'lobby:command',await f.command(a,{type:'fill-bots'})));
    for(const s of [a,b])unwrap(await send(s,'lobby:command',await f.command(s,{type:'ready',ready:true})));
    unwrap(await send(a,'lobby:command',await f.command(a,{type:'start'})));
    const before=await f.sync(a),v=before.game!.view,c={protocolVersion:1,commandId:'v3-wire-special',roomId:before.roomId,gameId:v.gameId,expectedVersion:v.version,action:{type:'discard',tileId:tile.id}};
    const after=unwrap(await send<CommandData>(a,'game:action',c)).snapshot!;
    expect(after.game!.view.players[0].specialKongs).toEqual([tile]);expect(after.game!.view.players[0].discards).toEqual([]);expect(after.game!.view.players[0].hand).toHaveLength(14);expect(after.game!.view.turn).toBe(0);expect(after.game!.view.response).toBeNull();expect(after.game!.view.remaining).toBe(v.remaining-1);
    expect(after.game!.table.presentation.tableAction).toMatchObject({type:'flower-gang',tile:kind});
    expect(unwrap(await send<CommandData>(a,'game:action',c)).duplicate).toBe(true);expect((await f.sync(a)).version).toBe(after.version);
    expect((await f.sync(b)).game!.view.players[0].hand).toEqual([]);
    expect(await send(b,'game:action',{...c,commandId:'foreign-special',expectedVersion:after.game!.view.version})).toMatchObject({ok:false,error:'ILLEGAL_ACTION'});
  });
  it.each(['websocket', 'polling'])('supports four seats, private snapshots and ready commands over %s', async transport => {
    const f = await fixture();
    const first = await f.connect(transport);
    const created = unwrap(await f.admit(first, 'create'));
    const players = [first]; const tokens = [created.token];
    for (let i = 1; i < 4; i++) {
      const player = await f.connect(transport);
      const joined = unwrap(await f.admit(player, 'join', created.snapshot.roomCode));
      expect(joined.snapshot.selfSeat).toBe(i); tokens.push(joined.token); players.push(player);
    }
    const outsider = await f.connect(transport);
    let outsiderSnapshots = 0; outsider.on('lobby:snapshot', () => outsiderSnapshots++);
    expect(await f.admit(outsider, 'join', created.snapshot.roomCode)).toMatchObject({ ok: false, error: 'ROOM_FULL', snapshot: null });
    expect(await f.admit(outsider, 'create')).toMatchObject({ ok: false, error: 'ROOM_EXISTS', snapshot: null });
    let pushed: LobbySnapshot | undefined;
    first.on('lobby:snapshot', view => { pushed = view; });
    for (const player of players) unwrap(await send<CommandData>(player, 'lobby:command', await f.command(player, { type: 'ready', ready: true })));
    await expect.poll(() => pushed?.canStart).toBe(true);
    expect(pushed?.selfSeat).toBe(0);
    for (let i = 0; i < 4; i++) {
      const view = await f.sync(players[i]!);
      expect(view.selfSeat).toBe(i);
      for (const token of tokens) expect(JSON.stringify(view)).not.toContain(token);
      expect(JSON.stringify(view)).not.toContain('connection');
    }
    expect(outsiderSnapshots).toBe(0);
    expect(created).not.toHaveProperty('replacedConnection');
  });
  it.each([4, 2])('completes an authoritative round over real sockets with %i humans', async humans => {
    const f = await fixture(); const players = [await f.connect()];
    const created = unwrap(await f.admit(players[0]!, 'create'));
    for (let i = 1; i < humans; i++) {
      const client = await f.connect(); unwrap(await f.admit(client, 'join', created.snapshot.roomCode)); players.push(client);
    }
    if (humans < 4) unwrap(await send(players[0]!, 'lobby:command', await f.command(players[0]!, { type: 'fill-bots' })));
    for (const player of players) unwrap(await send(player, 'lobby:command', await f.command(player, { type: 'ready', ready: true })));
    unwrap(await send(players[0]!, 'lobby:command', await f.command(players[0]!, { type: 'start' })));
    let finished: LobbySnapshot | undefined;
    for (let step = 0; step < 1200; step++) {
      f.advance(1000);
      const snapshots: LobbySnapshot[] = [];
      for (const player of players) snapshots.push(await f.sync(player));
      if (snapshots[0]!.phase === 'settled') { finished = snapshots[0]; break; }
      for (let i = 0; i < humans; i++) {
        const view = snapshots[i]!.game!.view;
        expect(view.players.filter((_, j) => j !== i).every(p => p.hand.length === 0)).toBe(true);
        expect(view).not.toHaveProperty('wall'); expect(view).not.toHaveProperty('log');
      }
      const active = snapshots.find(s => s.game!.view.actions.length);
      if (!active) {
        const version = snapshots[0]!.version;
        await expect.poll(async () => {
          // Bot delays use the injected clock; wall-clock polling alone cannot advance them.
          f.advance(500);
          return (await f.sync(players[0]!)).version;
        }).toBeGreaterThan(version);
        continue;
      }
      const view = active.game!.view;
      const reply = await send<CommandData>(players[active.selfSeat]!, 'game:action', {
        protocolVersion: 1, commandId: `action-${step}`, roomId: active.roomId, gameId: view.gameId,
        expectedVersion: view.response?.version ?? view.version,
        ...(view.response ? { windowId: view.response.id } : {}), action: chooseBotAction(view, active.selfSeat),
      });
      if (reply.ok === false) expect(['STALE_VERSION', 'STALE_WINDOW']).toContain(reply.error);
    }
    expect(finished?.game?.view.result).not.toBeNull();
    expect(finished).toBeDefined();
    expect(finished!.game!.view.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    const roundId = finished!.game!.view.gameId;
    const again = await f.sync(players[0]!); expect(again.version).toBe(finished!.version);
    unwrap(await send(players[0]!, 'lobby:command', await f.command(players[0]!, { type: 'next-round' })));
    expect((await f.sync(players[0]!)).phase).toBe('playing');
    expect((await f.sync(players[0]!)).game!.view.gameId).not.toBe(roundId);
  }, 15000);
  it('preserves idempotency and rejects stale or forged commands over the wire', async () => {
    const f = await fixture(); const a = await f.connect(); unwrap(await f.admit(a, 'create'));
    const cmd = await f.command(a, { type: 'ready', ready: true });
    const first = unwrap(await send<CommandData>(a, 'lobby:command', cmd));
    const again = unwrap(await send<CommandData>(a, 'lobby:command', cmd));
    expect(again.duplicate).toBe(true); expect(again.appliedVersion).toBe(first.appliedVersion);
    expect(await send(a, 'lobby:command', { ...cmd, commandId: 'stale' })).toMatchObject({ ok: false, error: 'STALE_VERSION', snapshot: { version: first.appliedVersion } });
    expect(await send(a, 'lobby:command', { ...cmd, actor: 1 })).toMatchObject({ ok: false, error: 'INVALID_MESSAGE' });
    expect(await send(a, 'game:cheat', { actor: 0 })).toMatchObject({ ok: false, error: 'INVALID_EVENT' });
  });
  it('rebinds a session and disconnects the old socket without exposing its ID', async () => {
    const f = await fixture(); const a = await f.connect(); const created = unwrap(await f.admit(a, 'create'));
    const b = await f.connect(); unwrap(await f.admit(b, 'join', created.snapshot.roomCode));
    const replacement = await f.connect();
    const oldClosed = disconnected(a);
    const resumed = unwrap(await send<AdmissionData>(replacement, 'lobby:admit', {
      protocolVersion: 1, commandId: 'resume-1', type: 'resume', roomId: created.snapshot.roomId, token: created.token,
    }));
    await oldClosed;
    expect(resumed.snapshot.selfSeat).toBe(0);
    expect(resumed).not.toHaveProperty('replacedConnection');
    expect((await f.sync(replacement)).seats[0]?.connected).toBe(true);
    const attacker = await f.connect();
    expect(await send(attacker, 'lobby:admit', { protocolVersion: 1, commandId: 'fake', type: 'resume',
      roomId: created.snapshot.roomId, token: '0'.repeat(64) })).toMatchObject({ ok: false, error: 'INVALID_SESSION', snapshot: null });
  });
  it('sweeps expired seats and broadcasts host transfer using the server clock', async () => {
    const f = await fixture(); const a = await f.connect(); const created = unwrap(await f.admit(a, 'create'));
    const b = await f.connect(); unwrap(await f.admit(b, 'join', created.snapshot.roomCode));
    let last: LobbySnapshot | undefined; b.on('lobby:snapshot', view => { last = view; });
    a.disconnect();
    await expect.poll(() => last?.seats[0]?.connected).toBe(false);
    expect(last?.hostSeat).toBe(1);
    f.advance(60_000);
    await expect.poll(() => last?.seats[0]).toBeNull();
    const c = await f.connect();
    expect(unwrap(await f.admit(c, 'join', created.snapshot.roomCode)).snapshot.selfSeat).toBe(0);
  });
  it.each(['websocket', 'polling'])('rejects missing or foreign Origin for %s', async transport => {
    const f = await fixture();
    expect(await denied(f.client(transport, 'https://foreign.example'))).toBeInstanceOf(Error);
    expect(await denied(f.client(transport, null))).toBeInstanceOf(Error);
    const health = await fetch(`${f.base}/health`, { headers: { Origin: origin } });
    expect(health.headers.get('access-control-allow-origin')).toBe(origin);
    expect((await health.json()).gameReady).toBe(true);
    expect((await fetch(`${f.base}/health`, { headers: { Origin: 'https://foreign.example' } })).status).toBe(403);
  });
  it('enforces event and IP admission limits without requiring a large load', async () => {
    const f = await fixture({ eventsPerSecond: 2, admissionPerMinute: 1 });
    const a = await f.connect(); const created = unwrap(await f.admit(a, 'create'));
    const b = await f.connect();
    expect(await f.admit(b, 'join', created.snapshot.roomCode)).toMatchObject({ ok: false, error: 'RATE_LIMITED' });
    await f.sync(a);
    expect(await send(a, 'lobby:sync', { protocolVersion: 1 })).toMatchObject({ ok: false, error: 'RATE_LIMITED' });
    f.advance(1000);
    expect((await f.sync(a)).selfSeat).toBe(0);
  });
  it('keeps the handshake budget across reconnects and restores it after expiry', async () => {
    const f = await fixture({ handshakePerMinute: 1 });
    const a = await f.connect(); a.disconnect();
    expect(await denied(f.client())).toBeInstanceOf(Error);
    f.advance(60_000);
    const b = await f.connect(); expect(b.connected).toBe(true);
  });
  it('rejects malformed sync requests without changing the room', async () => {
    const f = await fixture(); const a = await f.connect(); unwrap(await f.admit(a, 'create'));
    const before = await f.sync(a);
    for (const request of [null, [], {}, { protocolVersion: 2 }, { protocolVersion: 1, actor: 0 }]) {
      expect(await send(a, 'lobby:sync', request)).toMatchObject({ ok: false, error: 'INVALID_MESSAGE' });
    }
    expect(await f.sync(a)).toEqual(before);
  });
  it('caps transient connections and closes sockets that never take a seat', async () => {
    const f = await fixture({ connections: 1, idleMs: 100 });
    const a = await f.connect();
    expect(await denied(f.client())).toBeInstanceOf(Error);
    const closed = disconnected(a); f.advance(100); await closed;
    const b = await f.connect(); expect(b.connected).toBe(true);
  });
  it('rejects oversized packets and mutation events without acknowledgement', async () => {
    const f = await fixture(); const a = await f.connect();
    a.emit('lobby:admit', { protocolVersion: 1, commandId: 'no-ack', type: 'create', nickname: '甲' });
    expect(await send(a, 'lobby:sync', { protocolVersion: 1 })).toMatchObject({ ok: false, error: 'INVALID_SESSION' });
    const closed = disconnected(a);
    a.emit('lobby:admit', { nickname: 'x'.repeat(4096) }, () => {});
    await closed;
    const b = await f.connect(); expect(unwrap(await f.admit(b, 'create')).snapshot.selfSeat).toBe(0);
  });
  it('shuts down live connections and invalidates prior in-memory sessions on restart', async () => {
    const f = await fixture(); const a = await f.connect(); const created = unwrap(await f.admit(a, 'create'));
    const closed = disconnected(a); await f.app.close(); await closed; await f.app.close();
    const next = await fixture(); const b = await next.connect();
    expect(await send(b, 'lobby:admit', { protocolVersion: 1, commandId: 'resume', type: 'resume',
      roomId: created.snapshot.roomId, token: created.token })).toMatchObject({ ok: false, error: 'INVALID_SESSION' });
  });
});
it('requires exact configured origins and fails closed in production', () => {
  expect(allowedOrigins(undefined, false)).toContain(origin);
  for (const raw of [undefined, '', '*', 'https://example.com/path', 'https://example.com/', 'null']) {
    expect(() => allowedOrigins(raw, true)).toThrow('ALLOWED_ORIGINS');
  }
  expect(allowedOrigins('https://example.com,https://example.com', true)).toEqual(['https://example.com']);
});


// Trusted server-side deck injection only; no client can choose a deck.
function competitionDeck(mode: 'wins' | 'claims') {
 const pool=createDeck();
 const take=(kind:TileKind)=>{const i=pool.findIndex(t=>t.kind===kind);if(i<0)throw new Error('exhausted '+kind);return pool.splice(i,1)[0]!;};
 const indicator=take('east');
 const wait=(ks:TileKind[])=>[...ks.flatMap(k=>[take(k),take(k),take(k)]),take('tong-5')];
 const hands:Tile[][]=mode==='wins'
  ? [[],wait(['wan-1','wan-2','tong-3','tiao-4']),wait(['wan-4','wan-5','tong-6','tiao-7']),[]]
  : [[],[take('tong-3'),take('tong-4')],[take('tong-5'),take('tong-5')],wait(['wan-1','wan-2','tiao-3','tiao-4'])];
 const extra=take('tong-5');
 for(const hand of hands)while(hand.length<13)hand.push(pool.pop()!);
 return {deck:[...Array.from({length:13},(_,i)=>hands.map(h=>h[i]!)).flat(),extra,...pool,indicator],extra};
}
async function competing(mode:'wins'|'claims'){
 const rig=competitionDeck(mode),f=await fixture({},rig.deck);
 const clients:Socket[]=[],tokens:string[]=[];
 const first=await f.connect();clients.push(first);
 const created=unwrap(await f.admit(first,'create'));tokens.push(created.token);
 for(let i=1;i<4;i++){const c=await f.connect();clients.push(c);tokens.push(unwrap(await f.admit(c,'join',created.snapshot.roomCode)).token);}
 for(const c of clients)unwrap(await send(c,'lobby:command',await f.command(c,{type:'ready',ready:true})));
 unwrap(await send(first,'lobby:command',await f.command(first,{type:'start'})));
 let serial=0;
 async function payload(seat:number,action:object){
  const snap=await f.sync(clients[seat]!),v=snap.game!.view;
  return {protocolVersion:1,commandId:'race-'+(++serial),roomId:snap.roomId,gameId:v.gameId,
   expectedVersion:v.response?.version??v.version,...(v.response?{windowId:v.response.id}:{}),action};
 }
 unwrap(await send(first,'game:action',await payload(0,{type:'discard',tileId:rig.extra.id})));
 async function passRemaining(){
  for(let i=1;i<4;i++){const v=(await f.sync(clients[i]!)).game!.view;if(v.actions.some(a=>a.type==='pass'))unwrap(await send(clients[i]!,'game:action',await payload(i,{type:'pass'})));}
 }
 return {...f,clients,tokens,payload,passRemaining,roomId:created.snapshot.roomId};
}
describe('real transport response competition',()=>{
 it.each([[1,2],[2,1]])('nearest win survives arrival order %j',async(a,b)=>{
  const f=await competing('wins');
  const commands=await Promise.all([f.payload(a,{type:'hu'}),f.payload(b,{type:'hu'})]);
  expect(commands[0]!.windowId).toBe(commands[1]!.windowId);
  const replies=await Promise.all(commands.map((c,i)=>send<CommandData>(f.clients[[a,b][i]!]!,'game:action',c)));
  replies.forEach(unwrap);await f.passRemaining();
  const settled=await f.sync(f.clients[0]!);
  expect(settled.game!.view.result).toMatchObject({type:'win',winner:1});
  expect(settled.game!.view.result!.deltas.reduce((x,y)=>x+y,0)).toBe(0);
  const duplicate=unwrap(await send<CommandData>(f.clients[a]!,'game:action',commands[0]));
  expect(duplicate.duplicate).toBe(true);
  expect((await f.sync(f.clients[0]!)).version).toBe(settled.version);
  for(let i=0;i<4;i++){
   const v=(await f.sync(f.clients[i]!)).game!.view;
   expect(v.players.every((p,j)=>j===i||p.hand.length===0)).toBe(true);
   expect(v).not.toHaveProperty('wall');
  }
 });
 it.each([true,false])('hu > peng > chi with winner responding=%s',async(win)=>{
  const f=await competing('claims');
  const v=(await f.sync(f.clients[1]!)).game!.view;
  const chi=v.actions.find(a=>a.type==='chi');expect(chi).toBeDefined();
  const commands=await Promise.all([f.payload(1,chi!),f.payload(2,{type:'peng'}),f.payload(3,{type:win?'hu':'pass'})]);
  for(let i=0;i<3;i++)unwrap(await send(f.clients[i+1]!,'game:action',commands[i]));
  const end=(await f.sync(f.clients[0]!)).game!.view;
  if(win)expect(end.result).toMatchObject({type:'win',winner:3});
  else{expect(end.turn).toBe(2);expect(end.players[2]!.melds[0]!.type).toBe('peng');expect(end.players[0]!.discards).toHaveLength(0);}
 });
 it('preserves submitted win through disconnect/resume and rejects a late competing response',async()=>{
  const f=await competing('wins');
  const submitted=await f.payload(1,{type:'hu'}),late=await f.payload(2,{type:'hu'});
  unwrap(await send(f.clients[1]!,'game:action',submitted));f.clients[1]!.disconnect();
  const restored=await f.connect();f.clients[1]=restored;
  const resumed=unwrap(await send<AdmissionData>(restored,'lobby:admit',{protocolVersion:1,commandId:'resume-race',type:'resume',roomId:f.roomId,token:f.tokens[1]}));
  expect(resumed.snapshot.game!.view.response?.submitted).toBe(true);
  expect(resumed.snapshot.game!.view.actions).toHaveLength(0);
  f.advance(10_001);
  const reply=await send(f.clients[2]!,'game:action',late);
  expect(reply).toMatchObject({ok:false,error:'GAME_ENDED'});
  expect((await f.sync(f.clients[0]!)).game!.view.result).toMatchObject({type:'win',winner:1});
  expect(unwrap(await send<CommandData>(restored,'game:action',submitted)).duplicate).toBe(true);
 });
});


