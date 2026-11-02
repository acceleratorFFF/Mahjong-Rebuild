import {commandId} from './command-id'
import {backendOrigin} from './endpoint'
import {ACCOUNT_KEY} from '../account/contracts'
import {accessToken,currentAccount} from '../account/client'
import {shallowRef,ref} from 'vue'
import {io} from 'socket.io-client'
import type {Action} from '../game/variants/macheng/core'
import type {LocalSnapshot} from '../game/variants/macheng/host/localSession'
import type {ActionTicket} from '../game/variants/macheng/host/localSession'
import type {LobbySnapshot,Reply,AdmissionData,CommandData} from './protocol'

export interface TableSession {
  snapshot():LocalSnapshot;startReady():void;advance():boolean;dispose():void;setAutoplay(value:boolean):void|Promise<boolean>;
  submit(action:Action,ticket:ActionTicket):boolean|Promise<boolean>;nextRound():boolean|Promise<boolean>;
}
export const SESSION_KEY='macheng-p3-session-v1'
const messages:Record<string,string>={INVALID_SESSION:'会话已失效（可能本地服务已重启或保留时间已过），请重新创建或加入。',ROOM_EXISTS:'本地已有房间，请输入房间号加入。',ROOM_NOT_FOUND:'未找到该房间。',ROOM_FULL:'房间已满（最多四人）。',NOT_HOST:'只有当前房主可执行此操作。',NOT_READY:'需要四席齐全、至少两名真人在线，房主以外的三席全部准备。',WRONG_PHASE:'当前牌局阶段不允许此操作。',STALE_VERSION:'房间或牌局已更新，请按最新状态操作。',STALE_WINDOW:'响应窗口已更新，请重新选择。',ILLEGAL_ACTION:'当前操作不合法，已同步最新牌局。',RATE_LIMITED:'操作过于频繁，请稍后再试。',COMMAND_ID_REUSED:'操作编号冲突，请重新操作。'}
export function createRoomClient(){
  const showMatchResults=ref(false)
  const room=shallowRef<LobbySnapshot|null>(null),connected=ref(false),busy=ref(false),notice=ref('正在连接本地服务…')
  let credential:{roomId:string;token:string}|null=null,replaced=false,receivedAt=performance.now(),seen='',generation=0
  try{const v=JSON.parse(sessionStorage.getItem(SESSION_KEY)??'null');if(v&&typeof v.roomId==='string'&&/^[a-f0-9]{64}$/.test(v.token))credential=v}catch{sessionStorage.removeItem(SESSION_KEY)}
  const socket=io(backendOrigin||undefined,{auth:{token:accessToken()},autoConnect:false,transports:['websocket','polling'],reconnection:true,reconnectionDelay:800,reconnectionDelayMax:3000,timeout:5000})
  const id=commandId
  function apply(next:LobbySnapshot|null){
    if(next&&room.value?.roomId===next.roomId&&next.version<room.value.version)return
    if(next?.match?.state==='early'&&room.value?.match?.state!=='early')showMatchResults.value=true
    room.value=next;receivedAt=performance.now()
  }
  function send<T>(event:string,input:unknown):Promise<Reply<T>>{
    return new Promise((resolve,reject)=>{
      if(!socket.connected)return reject(new Error('OFFLINE'))
      socket.timeout(5000).emit(event as any,input,(error:Error|null,reply:Reply<T>)=>error?reject(error):resolve(reply))
    })
  }
  function rejectReply(reply:Reply<unknown>){
    if(reply.ok!==false)return
    notice.value=messages[reply.error]??`操作未生效：${reply.error}`
    if(reply.snapshot)apply(reply.snapshot)
    if(reply.error==='INVALID_SESSION'){credential=null;sessionStorage.removeItem(SESSION_KEY);apply(null);connected.value=socket.connected}
  }
  async function admit(input:object){
    if(busy.value)return;busy.value=true;const started=generation
    try{
      let reply:Reply<AdmissionData>
      try{reply=await send('lobby:admit',input)}catch(error){if(!socket.connected)throw error;reply=await send('lobby:admit',input)}
      if(started!==generation)return
      if(reply.ok){credential={roomId:reply.data.snapshot.roomId,token:reply.data.token};sessionStorage.setItem(SESSION_KEY,JSON.stringify(credential));apply(reply.data.snapshot);connected.value=true;notice.value='已连接本地房间。'}
      else rejectReply(reply)
    }catch{if(started===generation)notice.value='连接中断或请求未确认，请等待恢复后重试。'}finally{if(started===generation)busy.value=false}
  }
  socket.on('connect',()=>{
    connected.value=!credential
    if(credential&&!replaced)void admit({protocolVersion:1,commandId:id(),type:'resume',...credential})
    else {notice.value='已连接，可创建或加入本地房间。';void recover()}
  })
  socket.on('connect_error',()=>{connected.value=false;notice.value='未连接本地服务，请先启动服务端；正在重试。'})
  socket.on('disconnect',()=>{generation++;busy.value=false;connected.value=false;if(!replaced)notice.value='连接中断，保留当前牌面，正在恢复服务端会话…'})
  socket.on('account:expired',()=>{sessionStorage.removeItem(ACCOUNT_KEY);currentAccount.value=null;socket.disconnect()})
  socket.on('lobby:snapshot',apply)
  socket.on('session:replaced',()=>{replaced=true;connected.value=false;credential=null;sessionStorage.removeItem(SESSION_KEY);notice.value='会话已在另一窗口恢复，本窗口停止控制。';socket.disconnect()})
  async function recover(){try{const r=await send<AdmissionData>('lobby:admit',{protocolVersion:1,commandId:id(),type:'recover'});if(r.ok){credential={roomId:r.data.snapshot.roomId,token:r.data.token};sessionStorage.setItem(SESSION_KEY,JSON.stringify(credential));apply(r.data.snapshot)}}catch{}}
  async function sync(){if(!socket.connected)return;try{const r=await send<LobbySnapshot>('lobby:sync',{protocolVersion:1});if(r.ok)apply(r.data);else rejectReply(r)}catch{notice.value='同步未完成，等待重新连接。'}}
  async function command(type:string,extra:object={}){
    if(!room.value||!connected.value||busy.value)return false
    busy.value=true;const started=generation
    try{const r=await send<CommandData>('lobby:command',{protocolVersion:1,commandId:id(),roomId:room.value.roomId,expectedVersion:room.value.version,type,...extra})
      if(started!==generation)return false
      if(r.ok===false){rejectReply(r);return false}
      apply(r.data.snapshot);notice.value='操作已确认。'
      if(!r.data.snapshot){credential=null;sessionStorage.removeItem(SESSION_KEY)}return true
    }catch{if(started===generation){notice.value='操作未确认，正在同步服务端状态。';await sync()}return false}finally{if(started===generation)busy.value=false}
  }
  let lastTable:LocalSnapshot|null=null
  const table:TableSession={
    snapshot(){const current=room.value?.game?.table;if(current)lastTable=current;if(!lastTable)throw Error('No server table yet')
      return {...lastTable,now:(room.value?.serverNow??lastTable.now)+Math.max(0,performance.now()-receivedAt)}},
    startReady(){},dispose(){},setAutoplay(enabled){return command('autoplay',{enabled,gameId:room.value?.game?.view.gameId})},
    advance(){const next=`${room.value?.roomId}/${room.value?.version}`;if(next===seen)return false;seen=next;return true},
    async submit(action,ticket){
      if(!connected.value||busy.value||!room.value?.game)return false
      busy.value=true;const started=generation
      try{const r=await send<CommandData>('game:action',{protocolVersion:1,commandId:id(),roomId:room.value.roomId,gameId:ticket.gameId,expectedVersion:ticket.version,...(ticket.windowId?{windowId:ticket.windowId}:{}),action})
        if(started!==generation)return false
        if(r.ok===false){rejectReply(r);return false}apply(r.data.snapshot);notice.value='牌局操作已确认。';return true
      }catch{if(started===generation){notice.value='操作未确认，正在同步最新牌局。';await sync()}return false}finally{if(started===generation)busy.value=false}
    },
    nextRound:()=>{if(room.value?.match&&room.value.match.state!=='active'){showMatchResults.value=true;return true}return command('next-round')},
  }
  socket.connect()
  return {room,connected,busy,notice,table,showMatchResults,
    create:(nickname:string)=>admit({protocolVersion:1,commandId:id(),type:'create',nickname}),
    join:(nickname:string,roomCode:string)=>admit({protocolVersion:1,commandId:id(),type:'join',nickname,roomCode}),
    command,sync,retry(){if(replaced){location.reload();return}if(credential&&socket.connected)void admit({protocolVersion:1,commandId:id(),type:'resume',...credential});else if(socket.connected)void recover();else socket.connect()},close(){socket.disconnect()},
  }
}
