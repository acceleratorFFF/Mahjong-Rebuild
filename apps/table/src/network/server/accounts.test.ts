import {it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Accounts} from './accounts'
const credentials={username:'test_player',password:'fixture-only-strong-password',nickname:'自定义玩家',avatar:'shisan'}
it('salted accounts persist; sessions, passwords and private hashes never appear in public profiles',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macheng-account-')),file=path.join(dir,'accounts.json')
 try{const a=new Accounts(file),s=await a.register(credentials);expect(s.user).toMatchObject({nickname:credentials.nickname,avatar:'shisan'});expect(s.user).not.toHaveProperty('password');expect(s.user).not.toHaveProperty('hash');const stored=fs.readFileSync(file,'utf8');expect(stored).not.toContain(credentials.password);expect(stored).not.toContain(s.token);const b=new Accounts(file);const login=await b.login({username:'TEST_PLAYER',password:credentials.password});expect(login.user.id).toBe(s.user.id);expect(()=>b.authenticate(s.token)).toThrow('AUTH_REQUIRED');expect(b.update(login.token,{nickname:'新名字',avatar:'lotus'}).id).toBe(s.user.id);b.logout(login.token);expect(()=>b.authenticate(login.token)).toThrow('AUTH_REQUIRED')}
 finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir)}
})
it('rejects duplicate usernames, forged profiles and invalid credentials; tokens expire',async()=>{let now=1000;const a=new Accounts(undefined,()=>now),s=await a.register(credentials);await expect(a.register({...credentials,username:'TEST_PLAYER'})).rejects.toThrow('USERNAME_TAKEN');for(const username of ['missing_user','test_player'])await expect(a.login({username,password:'incorrect-password'})).rejects.toThrow('LOGIN_FAILED');expect(()=>a.update(s.token,{nickname:'合法',avatar:'https://foreign.example/x.svg'})).toThrow('INVALID_ACCOUNT');expect(()=>a.update(s.token,{nickname:'合法',avatar:'lotus',id:'other'})).toThrow('INVALID_ACCOUNT');now+=7*86400000;expect(()=>a.authenticate(s.token)).toThrow('AUTH_REQUIRED')})
it('concurrent registrations cannot allocate the same username twice',async()=>{const a=new Accounts(),r=await Promise.allSettled([a.register(credentials),a.register(credentials)]);expect(r.filter(x=>x.status==='fulfilled')).toHaveLength(1)})

it('administrator assignment persists; admin-only creation preserves identity and rejects role injection',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macheng-admin-')),file=path.join(dir,'accounts.json');
 try{const a=new Accounts(file),first=await a.register(credentials);expect(()=>a.grantAdmin('missing')).toThrow('ACCOUNT_NOT_FOUND');await expect(a.create(first.token,{...credentials,username:'no_admin'})).rejects.toThrow('ADMIN_REQUIRED');a.grantAdmin(credentials.username);expect(a.authenticate(first.token).admin).toBe(true);
 const made=await a.create(first.token,{...credentials,username:'managed_user'});expect(made).not.toHaveProperty('token');expect(made.user.admin).not.toBe(true);expect(a.authenticate(first.token).id).toBe(first.user.id);
 await expect(a.create(first.token,{...credentials,username:'forge_admin',admin:true})).rejects.toThrow('INVALID_ACCOUNT');const b=new Accounts(file);expect((await b.login({username:credentials.username,password:credentials.password})).user.admin).toBe(true);}
 finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir)}
})
