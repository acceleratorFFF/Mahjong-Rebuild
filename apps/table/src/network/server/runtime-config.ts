import path from 'node:path'
import {allowedOrigins} from './network'
// 服务始终绑定回环；部署配置只能改变端口、精确来源和独立数据目录。
export function runtimeConfig(env:NodeJS.ProcessEnv=process.env){
 const production=env.MACHENG_MODE==='production'
 if(env.MACHENG_MODE&&!['local','production'].includes(env.MACHENG_MODE))throw Error('Invalid MACHENG_MODE')
 const port=Number(env.MACHENG_PORT??4174)
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid MACHENG_PORT')
 const origins=allowedOrigins(env.MACHENG_ALLOWED_ORIGINS??(production?undefined:'http://127.0.0.1:4173,http://localhost:4173'),production)
 if(production&&origins.some(o=>new URL(o).protocol!=='https:'))throw Error('Production origins must be HTTPS')
 if(production&&(!env.MACHENG_DATA_DIR||!path.isAbsolute(env.MACHENG_DATA_DIR)))throw Error('Production requires absolute MACHENG_DATA_DIR')
 return {host:'127.0.0.1',port,origins,dataDir:path.resolve(env.MACHENG_DATA_DIR??'.local'),production}
}
