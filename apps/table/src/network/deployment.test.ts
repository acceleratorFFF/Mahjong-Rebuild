import {it,expect} from 'vitest'
import {parseBackendOrigin,accountUrl} from './endpoint'
import {runtimeConfig} from './server/runtime-config'
import {createAppServer} from './server/server'
it('explicit backend origin rejects paths, credentials, insecure remote and non HTTP endpoints',()=>{
 for(const s of ['https://api.example.test/','https://u:p@api.example.test','http://192.168.0.1:4174','javascript:alert(1)','https://api.example.test/a','https://api.example.test?x=1'])expect(()=>parseBackendOrigin(s)).toThrow()
 expect(parseBackendOrigin('https://api.example.test')).toBe('https://api.example.test');expect(parseBackendOrigin('http://127.0.0.1:4184')).toBe('http://127.0.0.1:4184');expect(accountUrl('me')).toBe('/api/account/me')
})
it('production startup fails closed without exact HTTPS origins or absolute data directory; bind stays loopback',()=>{
 expect(()=>runtimeConfig({MACHENG_MODE:'production'})).toThrow()
 for(const patch of [{MACHENG_ALLOWED_ORIGINS:'*'},{MACHENG_ALLOWED_ORIGINS:'http://example.test'},{MACHENG_DATA_DIR:'relative'},{MACHENG_PORT:'0'}])expect(()=>runtimeConfig({MACHENG_MODE:'production',MACHENG_ALLOWED_ORIGINS:'https://friends.github.io',MACHENG_DATA_DIR:process.cwd(),...patch})).toThrow()
 expect(runtimeConfig({}).port).toBe(4174);expect(runtimeConfig({MACHENG_MODE:'production',MACHENG_ALLOWED_ORIGINS:'https://friends.github.io',MACHENG_DATA_DIR:process.cwd()})).toMatchObject({host:'127.0.0.1',production:true})
})
it('account CORS preflight is allowed only for configured origin and method/headers; denied origins cannot read account API',async()=>{
 const origin='http://127.0.0.1:4183',app=createAppServer({origins:[origin]});await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.address() as any).port}`
 try{const headers={Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'},r=await fetch(base+'/api/account/login',{method:'OPTIONS',headers});expect(r.status).toBe(204);expect(r.headers.get('access-control-allow-origin')).toBe(origin);expect(r.headers.get('access-control-allow-credentials')).toBeNull();for(const patch of [{Origin:'http://evil.invalid'},{'Access-Control-Request-Method':'DELETE'},{'Access-Control-Request-Headers':'x-admin'}])expect((await fetch(base+'/api/account/login',{method:'OPTIONS',headers:{...headers,...patch}})).status).toBe(403);expect((await fetch(base+'/api/account/me',{headers:{Origin:'http://evil.invalid'}})).status).toBe(403)}finally{await new Promise<void>(r=>app.close(()=>r()))}
})
