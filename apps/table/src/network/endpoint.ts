// Pages 与后端分站时只允许明确的 HTTPS 来源；HTTP 仅供本机隔离预演。
export function parseBackendOrigin(raw:string=''):string {
 if(!raw)return ''
 const u=new URL(raw)
 if(u.origin!==raw||u.username||u.password||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))throw Error('VITE_BACKEND_ORIGIN must be an exact HTTPS origin (loopback HTTP is rehearsal-only)')
 return raw
}
// 头像契约也会由原生 Node 测试宿主导入；没有 Vite 环境时保持本地同源默认值。
export const backendOrigin=parseBackendOrigin(import.meta.env?.VITE_BACKEND_ORIGIN??'')
export function accountUrl(endpoint:string){return `${backendOrigin}/api/account/${endpoint}`}
