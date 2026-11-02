import {it,expect} from 'vitest'
import http from 'node:http'
import {io} from 'socket.io-client'
import {createNetworkServer} from './server/network'
import {connectionOptions,connectionErrorNotice} from './connection'

// 用真实Socket.IO和只阻断一种传输的本地代理验证，不将模拟写为大陆真机结果。
for(const blocked of ['websocket','polling'] as const)it(`continues when ${blocked} is blocked`,async()=>{
 const origin='http://127.0.0.1:4183',backend=createNetworkServer({origins:[origin],allowGuestForTests:true})
 await new Promise<void>(r=>backend.http.listen(0,'127.0.0.1',r))
 const port=(backend.http.address() as any).port,sockets=new Set<any>()
 const proxy=http.createServer((req,res)=>{
  if(blocked==='polling'&&req.url?.includes('transport=polling')){res.writeHead(503).end();return}
  const up=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode!,r.headers);r.pipe(res)})
  up.on('error',()=>res.destroy());req.pipe(up)
 })
 proxy.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))})
 proxy.on('upgrade',(req,s,head)=>{
  if(blocked==='websocket'){s.destroy();return}
  const up=http.request({hostname:'127.0.0.1',port,path:req.url,headers:req.headers})
  up.on('upgrade',(r,b,h)=>{sockets.add(b);b.on('close',()=>sockets.delete(b));s.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(r.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(head.length)b.write(head);if(h.length)s.write(h);s.on('error',()=>b.destroy());b.on('error',()=>s.destroy());s.pipe(b);b.pipe(s)})
  up.on('error',()=>s.destroy());up.end()
 })
 await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r))
 const socket=io(`http://127.0.0.1:${(proxy.address() as any).port}`,{...connectionOptions(),forceNew:true,reconnection:false,extraHeaders:{Origin:origin}})
 try{
  await new Promise<void>((r,j)=>{socket.once('connect',r);socket.once('connect_error',j)})
  const reply:any=await new Promise((r,j)=>socket.timeout(3000).emit('lobby:admit',{protocolVersion:1,commandId:'fallback-'+blocked,type:'create',nickname:'传输验证'},(err:any,value:any)=>err?j(err):r(value)))
  expect(reply.ok).toBe(true)
  expect(socket.io.engine.transport.name).toBe(blocked==='websocket'?'polling':'websocket')
 }finally{
  socket.disconnect();for(const s of sockets)s.destroy()
  await new Promise<void>(r=>proxy.close(()=>r()));await backend.close()
 }
},15000)
it('connection failures do not tell online players to start a local server',()=>{
 expect(connectionErrorNotice('websocket error')).not.toContain('本地')
 expect(connectionErrorNotice('CONNECTION_LIMIT')).toContain('关闭重复页面')
})
