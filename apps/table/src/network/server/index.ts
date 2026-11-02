import {Accounts} from './accounts'
import {Avatars} from './avatars'
import {MenuCopy} from './menu-copy'
import path from 'node:path'
import {runtimeConfig} from './runtime-config'
import fs from 'node:fs'
const config=runtimeConfig()
import {createNetworkServer} from './network'
const accounts=new Accounts(path.join(config.dataDir,'accounts.json'),Date.now,new Avatars(path.join(config.dataDir,'avatars')),new MenuCopy(path.join(config.dataDir,'menu-copy.json')))
// 新环境的首次管理员只从标准输入接收密码，不提供公开注册或命令行明文密码参数。
if(process.argv[2]==='--bootstrap-admin'){
 if(fs.existsSync(path.join(config.dataDir,'accounts.json'))||!process.argv[3]||process.argv.length!==4)throw Error('Bootstrap requires a new account store and username; password is stdin-only')
 let text='';for await(const chunk of process.stdin){text+=chunk.toString();if(text.length>74)throw Error('Invalid password input')}
 const password=text.replace(/\r?\n$/,'')
 await accounts.register({username:process.argv[3],password,nickname:'管理员',avatar:'lotus'});accounts.grantAdmin(process.argv[3]);process.stdout.write('Administrator initialized.\n');process.exit(0)
}
if(process.argv[2]==='--grant-admin'){try{if(!process.argv[3])throw Error('USERNAME_REQUIRED');accounts.grantAdmin(process.argv[3]);process.stdout.write('Administrator assigned.\n');process.exit(0)}catch{process.stderr.write('Administrator not assigned: existing username required.\n');process.exit(1)}}
const app=createNetworkServer({accounts,origins:config.origins})
app.http.listen(config.port,config.host,()=>process.stdout.write(`Mahjong server: http://${config.host}:${config.port}\n`))
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0))})
