import {it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Avatars,inspectImage} from './avatars'
import {Accounts} from './accounts'
const png=()=>fs.readFileSync(new URL('../tests/fixtures/avatar.png',import.meta.url))
it('validates actual PNG, JPEG and WebP dimensions and rejects SVG, corruption, non-square and oversized payloads',()=>{
 for(const ext of ['png','jpg','webp'])expect(inspectImage(fs.readFileSync(new URL(`../tests/fixtures/avatar.${ext}`,import.meta.url)))).toMatchObject({width:64,height:64});for(const b of [Buffer.from('<svg onload="alert(1)"/>'),png().subarray(0,30),Buffer.alloc(2*1024*1024+1)])expect(()=>inspectImage(b)).toThrow('INVALID_IMAGE');const corrupt=png();corrupt[30]^=1;expect(()=>inspectImage(corrupt)).toThrow('INVALID_IMAGE')
})
it('avatar IDs, bytes, visibility and ordering persist; disabled art remains readable and cannot be newly selected',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macheng-avatar-'));try{const a=new Avatars(dir),item=a.upload({name:'新头像',source:'测试自产',data:png().toString('base64')});expect(a.read(item.id)!.data).toEqual(png());a.update({id:item.id,enabled:false,order:0});const b=new Avatars(dir);expect(b.list().some(v=>v.id===item.id)).toBe(false);expect(b.read(item.id)!.data).toEqual(png());expect(b.read('../../catalog.json')).toBeNull();
 const users=new Accounts(undefined,Date.now,b);await expect(users.register({username:'new_user',password:'fixture-password',nickname:'用户',avatar:item.id})).rejects.toThrow('INVALID_ACCOUNT');b.update({id:item.id,enabled:true,order:0});const u=await users.register({username:'new_user',password:'fixture-password',nickname:'用户',avatar:item.id});b.update({id:item.id,enabled:false,order:0});expect(users.update(u.token,{nickname:'仅改昵称',avatar:item.id}).avatar).toBe(item.id);
 }finally{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir)}
})
it('administrator enable and reset enforce permissions, revoke every old session, preserve identity and recheck active match after password derivation',async()=>{
 const a=new Accounts(),body={username:'test_admin',password:'fixture-admin-password',nickname:'管理',avatar:'lotus'},admin=await a.register(body);a.grantAdmin(body.username);const u=await a.register({...body,username:'user_one'}),u2=await a.login({username:'user_one',password:body.password});
 expect(()=>a.list(u.token)).toThrow('ADMIN_REQUIRED');expect(()=>a.setEnabled(admin.token,{id:admin.user.id,enabled:false})).toThrow('PROTECTED_ACCOUNT');expect(()=>a.setEnabled(admin.token,{id:u.user.id,enabled:false},()=>true)).toThrow('ACCOUNT_IN_MATCH');
 a.setEnabled(admin.token,{id:u.user.id,enabled:false});for(const s of [u,u2])expect(()=>a.authenticate(s.token)).toThrow('AUTH_REQUIRED');await expect(a.login({username:'user_one',password:body.password})).rejects.toThrow('LOGIN_FAILED');a.setEnabled(admin.token,{id:u.user.id,enabled:true});const back=await a.login({username:'user_one',password:body.password});let checks=0;await expect(a.resetPassword(admin.token,{id:u.user.id,password:'new-fixture-password'},()=>++checks>1)).rejects.toThrow('ACCOUNT_IN_MATCH');expect(a.authenticate(back.token).id).toBe(u.user.id);
 await a.resetPassword(admin.token,{id:u.user.id,password:'new-fixture-password'});expect(()=>a.authenticate(back.token)).toThrow('AUTH_REQUIRED');await expect(a.login({username:'user_one',password:body.password})).rejects.toThrow('LOGIN_FAILED');expect((await a.login({username:'user_one',password:'new-fixture-password'})).user.id).toBe(u.user.id);for(const item of a.list(admin.token)){expect(item).not.toHaveProperty('salt');expect(item).not.toHaveProperty('hash')}
})
