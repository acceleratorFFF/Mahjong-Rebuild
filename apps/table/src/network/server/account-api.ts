import type {IncomingMessage,ServerResponse} from 'node:http'
import {Accounts,AccountError} from './accounts'
import {AvatarError} from './avatars'
import {MenuCopyError} from './menu-copy'
import {RateLimit} from './rate-limit'
interface Hooks {room?:(id:string)=>{roomCode:string;active:boolean;inMatch:boolean}|null;away?:(id:string)=>void;revoke?:(id:string)=>void}
export function accountApi(accounts:Accounts,onLogout?:(token:string)=>void,hooks:Hooks={}){
 const attempts=new RateLimit(12,60000,Date.now)
 return (req:IncomingMessage,res:ServerResponse)=>{
  const route=req.url?.split('?')[0];if(!route?.startsWith('/api/account/'))return false
  const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  const reply=(status:number,data:unknown)=>{if(!res.writableEnded)res.writeHead(status).end(JSON.stringify(data))}
  void(async()=>{try{
   if(req.method==='GET'&&route.startsWith('/api/account/avatar/')){const image=accounts.avatars.read(route.slice('/api/account/avatar/'.length));if(!image){reply(404,{error:'NOT_FOUND'});return}res.setHeader('Content-Type',image.mime);res.setHeader('Cache-Control','public,max-age=86400');res.writeHead(200).end(image.data);return}
   if(req.method==='GET'){
    const user=accounts.authenticate(token)
    if(route==='/api/account/menu-copy'){reply(200,{lines:accounts.menuCopy.list()});return}
    if(route==='/api/account/me'){reply(200,{user});return}
    if(route==='/api/account/room'){reply(200,{room:hooks.room?.(user.id)??null});return}
    if(route==='/api/account/avatars'){reply(200,{avatars:accounts.avatars.list(!!user.admin),currentAvatar:accounts.avatars.list(true).find(a=>a.id===user.avatar)??null});return}
    if(route==='/api/account/users'){reply(200,{users:accounts.list(token)});return}
    reply(404,{error:'NOT_FOUND'});return
   }
   if(req.method!=='POST'){reply(405,{error:'METHOD_NOT_ALLOWED'});return}
   if(!attempts.take(req.socket.remoteAddress??'unknown')){reply(429,{error:'RATE_LIMITED'});return}
   if(['/api/account/menu-copy','/api/account/register','/api/account/avatar-upload','/api/account/avatar-update','/api/account/user-enabled','/api/account/user-password'].includes(route))accounts.requireAdmin(token)
   const limit=route==='/api/account/avatar-upload'?2800000:route==='/api/account/menu-copy'?8192:2048;const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit){reply(413,{error:route.includes('avatar')?'INVALID_IMAGE':'INVALID_ACCOUNT'});return}chunks.push(chunk)}const raw=Buffer.concat(chunks).toString('utf8')
   let body:unknown;try{body=JSON.parse(raw)}catch{reply(400,{error:'INVALID_ACCOUNT'});return}
   const guard=(id:string)=>!!hooks.room?.(id)?.inMatch
   switch(route){
    case '/api/account/menu-copy':reply(200,{lines:accounts.menuCopy.update(body)});break
    case '/api/account/register':reply(200,await accounts.create(token,body));break
    case '/api/account/login':reply(200,await accounts.login(body));break
    case '/api/account/profile':reply(200,{user:accounts.update(token,body)});break
    case '/api/account/logout':accounts.logout(token);onLogout?.(String(token));reply(200,{ok:true});break
    case '/api/account/away':{const user=accounts.authenticate(token);hooks.away?.(user.id);reply(200,{ok:true});break}
    case '/api/account/user-enabled':{const id=accounts.setEnabled(token,body,guard);hooks.revoke?.(id);reply(200,{users:accounts.list(token)});break}
    case '/api/account/user-password':{const id=await accounts.resetPassword(token,body,guard);hooks.revoke?.(id);reply(200,{ok:true});break}
    case '/api/account/avatar-upload':reply(200,{avatar:accounts.avatars.upload(body)});break
    case '/api/account/avatar-update':reply(200,{avatars:accounts.avatars.update(body)});break
    default:reply(404,{error:'NOT_FOUND'})
   }
  }catch(e){const expected=e instanceof AccountError||e instanceof AvatarError||e instanceof MenuCopyError,code=expected?e.message:'ACCOUNT_UNAVAILABLE';reply(expected?(code==='ADMIN_REQUIRED'?403:code==='AUTH_REQUIRED'?401:400):500,{error:code})}})()
  return true
 }
}
