// 先复用可登录的HTTPS链路；WebSocket升级失败时仍可继续轮询。
export function connectionOptions(){
 return {transports:['polling','websocket'] as ('polling'|'websocket')[],tryAllTransports:true,reconnection:true,reconnectionDelay:800,reconnectionDelayMax:3000,timeout:10000}
}
export function connectionErrorNotice(message:string){
 if(message==='CONNECTION_LIMIT')return '连接数已满，请关闭重复页面后重新连接。'
 return '暂时无法连接游戏服务，正在重试；请检查当前网络或点击重新连接。'
}
