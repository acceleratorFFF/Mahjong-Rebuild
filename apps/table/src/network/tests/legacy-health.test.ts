import { it, expect } from 'vitest';
import { createAppServer } from '../server/server';
import { isHealthResponse } from '../protocol';
it('serves the versioned health contract and rejects unsupported routes/methods', async () => {
    const server = createAppServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing port');
      const base = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${base}/health`);
      expect(response.status).toBe(200);
      expect(isHealthResponse(await response.json())).toBe(true);
      const head = await fetch(`${base}/health`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
      expect((await fetch(`${base}/room`)).status).toBe(404);
      const post = await fetch(`${base}/health`, { method: 'POST' });
      expect(post.status).toBe(405);
      expect(post.headers.get('allow')).toBe('GET, HEAD');
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
