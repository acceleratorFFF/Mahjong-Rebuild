import {afterEach,it,expect} from 'vitest'
import {io,type Socket} from 'socket.io-client'
import fs from 'node:fs'
import path from 'node:path'
import {createNetworkServer} from '../server/network'
import type {AdmissionData,CommandData,LobbySnapshot,Reply} from '../protocol'
import {rig} from '../../game/variants/macheng/fixtures/actionScenarios'

const origin='http://127.0.0.1:5173',cleanups:(()=>Promise<void>)[]=[]
afterEach(async()=>{while(cleanups.length)await cleanups.pop()!()})
function send<T>(s:Socket,event:string,payload:object):Promise<Reply<T>>{return new Promise((resolve,reject)=>s.timeout(1500).emit(event,payload,(e:any,r:Reply<T>)=>e?reject(e):resolve(r)))}
function data<T>(r:Reply<T>):T{if(r.ok===false)throw Error(r.error);return r.data}
async function opening(){
  let now=1000,serial=0
  const g=rig({0:['red','red']}),deck=[...Array.from({length:13},(_,i)=>g.players.map(p=>p.hand[i]!)).flat(),g.players[0].hand[13]!,...g.wall,...g.indicators]
  const app=createNetworkServer({allowGuestForTests:true,origins:[origin],now:()=>now,roundOptions:{firstDealer:0,deck},limits:{sweepMs:10}}),clients:Socket[]=[],pushed:(LobbySnapshot|undefined)[]=[],tokens:string[]=[]
  cleanups.push(async()=>{clients.forEach(s=>s.disconnect());await app.close()})
  await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));const address=app.http.address();if(!address||typeof address==='string')throw Error('missing port')
  let roomCode=''
  for(let i=0;i<4;i++){
    const s=io(`http://127.0.0.1:${address.port}`,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{Origin:origin}});clients.push(s)
    s.on('lobby:snapshot',v=>{pushed[i]=v})
    await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject)})
    const a=data(await send<AdmissionData>(s,'lobby:admit',{protocolVersion:1,commandId:`admit-${i}`,type:i?'join':'create',nickname:`协议席${i}`,...(i?{roomCode}:{})}));tokens.push(a.token);roomCode=a.snapshot.roomCode
  }
  const sync=async(i=0)=>data(await send<LobbySnapshot>(clients[i]!,'lobby:sync',{protocolVersion:1}))
  const command=async(i:number,op:object)=>{const r=await sync(i);return {protocolVersion:1,commandId:`room-${++serial}`,roomId:r.roomId,expectedVersion:r.version,...op}}
  for(let i=0;i<4;i++)data(await send(clients[i]!,'lobby:command',await command(i,{type:'ready',ready:true})))
  data(await send(clients[0]!,'lobby:command',await command(0,{type:'start'})))
  return {clients,pushed,tokens,sync,command,advance(ms:number){now+=ms},async tick(){await new Promise(resolve=>setTimeout(resolve,40))}}
}
function publicState(r:LobbySnapshot){const v=r.game!.view;return {gameId:v.gameId,version:v.version,turn:v.turn,remaining:v.remaining,response:v.response?.id,players:v.players.map(p=>({discards:p.discards,melds:p.melds,specialKongs:p.specialKongs,handCount:p.handCount}))}}

it.each(['cancel-first','auto-first','manual-during-auto'])('wire handoff %s: no residual bot move, concurrent manual executes at most once and four seats agree',async order=>{
  const f=await opening(),s=f.clients[0]!,initial=await f.sync(),v=initial.game!.view,red=v.players[0].hand.find(t=>t.kind==='red')!
  const staleManual={protocolVersion:1,commandId:'old-manual',roomId:initial.roomId,gameId:v.gameId,expectedVersion:v.version,action:{type:'discard',tileId:red.id}}
  const enable=await f.command(0,{type:'autoplay',enabled:true,gameId:v.gameId});data(await send(s,'lobby:command',enable))
  f.advance(order==='auto-first'?450:449);await f.tick()
  const beforeCancel=await f.sync();expect(beforeCancel.game!.view.version).toBe(v.version+(order==='auto-first'?1:0))
  const cancel=await f.command(0,{type:'autoplay',enabled:false,gameId:v.gameId})
  if(order==='manual-during-auto'){
    // Same socket preserves send order. The old manual packet arrives before cancellation.
    const blocked=send(s,'game:action',staleManual),cancelled=send(s,'lobby:command',cancel)
    expect(await blocked).toMatchObject({ok:false,error:'ILLEGAL_ACTION'});data(await cancelled)
  }else data(await send(s,'lobby:command',cancel))
  const stopped=await f.sync();expect(stopped.game!.table.autoplay).toBe(false)
  f.advance(1500);await f.tick();expect(publicState(await f.sync())).toEqual(publicState(stopped))
  // Retrying a successful old enable only acknowledges its receipt, never re-enables control.
  const retry=data(await send<CommandData>(s,'lobby:command',enable));expect(retry.duplicate).toBe(true);expect(retry.snapshot!.game!.table.autoplay).toBe(false)
  if(order==='auto-first')expect(await send(s,'game:action',staleManual)).toMatchObject({ok:false,error:'STALE_VERSION'})
  const ready=await f.sync(),rv=ready.game!.view,tile=rv.players[0].hand.find(t=>t.kind==='red')!
  const manual={...staleManual,commandId:'fresh-manual',expectedVersion:rv.version,action:{type:'discard',tileId:tile.id}}
  // Two near-adjacent packets carrying the same entity/command must move it once.
  const first=send<CommandData>(s,'game:action',manual),duplicate=send<CommandData>(s,'game:action',manual)
  expect(data(await first).duplicate).toBe(false);expect(data(await duplicate).duplicate).toBe(true)
  f.advance(1000);await f.tick();const end=await f.sync()
  expect(end.game!.view.version).toBe(rv.version+1);expect(end.game!.view.remaining).toBe(rv.remaining-1)
  expect(end.game!.view.players[0].specialKongs.filter(t=>t.id===tile.id)).toHaveLength(1);expect(end.game!.table.autoplay).toBe(false)
  await expect.poll(()=>f.pushed.every(r=>r?.game?.view.version===end.game!.view.version)).toBe(true)
  for(let i=0;i<4;i++){
    const r=await f.sync(i);expect(publicState(r)).toEqual(publicState(end));expect(publicState(f.pushed[i]!)).toEqual(publicState(end))
    expect(r.game!.view.players.every((p,n)=>n===i||p.hand.length===0)).toBe(true);expect(r.game!.table.conservation).toEqual({total:136,unique:136,valid:true})
    for(const token of f.tokens)expect(JSON.stringify(r)).not.toContain(token)
  }
  if(process.env.MACHENG_HANDOFF_EVIDENCE){const out=path.resolve(process.env.MACHENG_HANDOFF_EVIDENCE);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,`WIRE_${order}.json`),JSON.stringify({order,initial:publicState(initial),cancelled:publicState(stopped),after:publicState(end),allFourPushesAgree:true,ownPrivateHandsOnly:true,autoplay:false,clockInjected:true,realPeople:false,realDevice:false},null,2))}
})
