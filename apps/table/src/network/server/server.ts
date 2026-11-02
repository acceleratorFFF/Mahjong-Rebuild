import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { PROTOCOL_VERSION, type HealthResponse } from '../protocol';

export function createAppServer(options: { origins?: readonly string[]; gameReady?: boolean; handler?:(req:IncomingMessage,res:ServerResponse)=>boolean } = {}) {
  const health: HealthResponse = { status: 'ok', service: 'mahjong-server', protocolVersion: PROTOCOL_VERSION, gameReady: options.gameReady ?? false };
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && options.origins) {
      res.setHeader('Vary', 'Origin');
      if (!options.origins.includes(origin)) {
        res.writeHead(403).end(JSON.stringify({ error: 'ORIGIN_DENIED' })); return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    // 分站部署使用 Bearer 请求，预检必须先于账号鉴权；不允许任意方法或请求头。
    if(req.method==='OPTIONS'){
      const route=req.url?.split('?')[0]??'';
      const method=req.headers['access-control-request-method'];
      const headers=String(req.headers['access-control-request-headers']??'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
      if(!origin||!options.origins?.includes(origin)||!route.startsWith('/api/account/')||!['GET','POST'].includes(method??'')||headers.some(h=>!['authorization','content-type'].includes(h))){res.writeHead(403).end(JSON.stringify({error:'PREFLIGHT_DENIED'}));return;}
      res.setHeader('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Max-Age','600');res.writeHead(204).end();return;
    }
    if(options.handler?.(req,res))return;
    const path = req.url?.split('?')[0];
    if (path !== '/health') {
      res.writeHead(404).end(JSON.stringify({ error: 'NOT_FOUND' }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.writeHead(405).end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
      return;
    }
    res.writeHead(200).end(req.method === 'HEAD' ? undefined : JSON.stringify(health));
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
