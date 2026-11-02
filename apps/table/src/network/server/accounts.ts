import {randomBytes,randomUUID,scrypt,timingSafeEqual,createHash} from 'node:crypto'
import {Avatars} from './avatars'
import {MenuCopy} from './menu-copy'
import {promisify} from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import {AVATAR_IDS,type PublicAccount,type AccountSession} from '../../account/contracts'
const derive=promisify(scrypt),sha=(s:string)=>createHash('sha256').update(s).digest('hex')
interface Record extends PublicAccount {salt:string;hash:string;disabled?:boolean}
export class AccountError extends Error {}
function fail(code:string):never{throw new AccountError(code)}
function input(value:unknown,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_ACCOUNT');const v=value as {[key:string]:unknown};if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!('value'in d)))fail('INVALID_ACCOUNT');return v}
function profile(v:{[key:string]:unknown},valid:(id:unknown)=>boolean){if(typeof v.nickname!=='string'||v.nickname!==v.nickname.trim()||v.nickname.length<1||v.nickname.length>16||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v.nickname)||!valid(v.avatar))fail('INVALID_ACCOUNT');return {nickname:v.nickname,avatar:v.avatar as PublicAccount['avatar']}}
const publicUser=(r:Record):PublicAccount=>({id:r.id,username:r.username,nickname:r.nickname,avatar:r.avatar,...(r.admin?{admin:true}:{})})
export class Accounts {
 private users:Record[]=[];private sessions=new Map<string,{id:string;expires:number}>();private inFlight=new Set<string>()
 constructor(private file?:string,private now=Date.now,readonly avatars=new Avatars(),readonly menuCopy=new MenuCopy()){if(file&&fs.existsSync(file)){const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(data)||data.some(r=>typeof r.id!=='string'||!/^[a-z0-9_]{3,24}$/.test(r.username)||!/^[a-f0-9]{32}$/.test(r.salt)||!/^[a-f0-9]{128}$/.test(r.hash)))throw Error('Account store invalid');this.users=data}}
 private save(users:Record[]){if(this.file){fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=`${this.file}.${randomUUID()}.tmp`;try{fs.writeFileSync(tmp,JSON.stringify(users),{mode:0o600,flag:'wx'});fs.renameSync(tmp,this.file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}this.users=users}
 private session(user:Record):AccountSession{const token=randomBytes(32).toString('hex');this.sessions.set(sha(token),{id:user.id,expires:this.now()+7*86400000});return {token,user:publicUser(user)}}
 async register(value:unknown){const v=input(value,['username','password','nickname','avatar']);if(typeof v.username!=='string'||!/^[a-zA-Z0-9_]{3,24}$/.test(v.username)||typeof v.password!=='string'||v.password.length<8||v.password.length>72)fail('INVALID_ACCOUNT');const username=v.username.toLowerCase(),p=profile(v,id=>this.avatars.selectable(id));if(this.users.some(u=>u.username===username)||this.inFlight.has(username))fail('USERNAME_TAKEN');this.inFlight.add(username);try{const salt=randomBytes(16).toString('hex'),hash=(await derive(v.password,salt,64) as Buffer).toString('hex');const user={id:randomUUID(),username,...p,salt,hash};this.save([...this.users,user]);return this.session(user)}finally{this.inFlight.delete(username)}}
 grantAdmin(username:string){const name=username.toLowerCase();if(!this.users.some(u=>u.username===name))fail('ACCOUNT_NOT_FOUND');this.save(this.users.map(u=>u.username===name?{...u,admin:true}:u));}
 async create(token:unknown,value:unknown){if(!this.authenticate(token).admin)fail('ADMIN_REQUIRED');const created=await this.register(value);this.logout(created.token);return {user:created.user};}
 async login(value:unknown){const v=input(value,['username','password']);if(typeof v.username!=='string'||typeof v.password!=='string'||v.username.length>24||v.password.length>72)fail('INVALID_ACCOUNT');const r=this.users.find(u=>u.username===String(v.username).toLowerCase());const hash=await derive(v.password,r?.salt??'00000000000000000000000000000000',64) as Buffer;if(!r||r.disabled||!timingSafeEqual(hash,Buffer.from(r.hash,'hex')))fail('LOGIN_FAILED');return this.session(r)}
 authenticate(token:unknown){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('AUTH_REQUIRED');const key=sha(token),s=this.sessions.get(key);if(!s||s.expires<=this.now()){this.sessions.delete(key);fail('AUTH_REQUIRED')}const r=this.users.find(u=>u.id===s.id);if(!r||r.disabled)fail('AUTH_REQUIRED');return publicUser(r)}
 update(token:unknown,value:unknown){const user=this.authenticate(token),v=profile(input(value,['nickname','avatar']),id=>id===user.avatar||this.avatars.selectable(id));this.save(this.users.map(u=>u.id===user.id?{...u,...v}:u));return {...user,...v}}
 requireAdmin(token:unknown){const user=this.authenticate(token);if(!user.admin)fail('ADMIN_REQUIRED');return user}
 list(token:unknown){this.requireAdmin(token);return this.users.map(r=>({...publicUser(r),enabled:!r.disabled}))}
 private target(token:unknown,id:unknown,guard:(id:string)=>boolean){const admin=this.requireAdmin(token);if(typeof id!=='string')fail('INVALID_ACCOUNT');const target=this.users.find(u=>u.id===id);if(!target)fail('ACCOUNT_NOT_FOUND');if(target.id===admin.id||target.admin)fail('PROTECTED_ACCOUNT');if(guard(target.id))fail('ACCOUNT_IN_MATCH');return target}
 revoke(id:string){for(const [key,s]of this.sessions)if(s.id===id)this.sessions.delete(key)}
 setEnabled(token:unknown,value:unknown,guard:(id:string)=>boolean=()=>false){const v=input(value,['id','enabled']);if(typeof v.enabled!=='boolean')fail('INVALID_ACCOUNT');const r=this.target(token,v.id,guard);this.save(this.users.map(u=>u.id===r.id?{...u,disabled:!v.enabled}:u));if(!v.enabled)this.revoke(r.id);return r.id}
 async resetPassword(token:unknown,value:unknown,guard:(id:string)=>boolean=()=>false){const v=input(value,['id','password']);if(typeof v.password!=='string'||v.password.length<8||v.password.length>72)fail('INVALID_ACCOUNT');const r=this.target(token,v.id,guard),salt=randomBytes(16).toString('hex'),hash=(await derive(v.password,salt,64)as Buffer).toString('hex');this.target(token,r.id,guard);this.save(this.users.map(u=>u.id===r.id?{...u,salt,hash}:u));this.revoke(r.id);return r.id}
 logout(token:unknown){this.authenticate(token);this.sessions.delete(sha(String(token)))}
}
