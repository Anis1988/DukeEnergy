import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { readFileSync } from 'node:fs';

/**
 * `npm run dev` runs the server functions too (api/*.ts, the same files Vercel runs), so the whole app works
 * locally without Vercel. Keys go in .env.local (never committed).
 */
function localApi(): Plugin {
  // vercel.json rewrites into api/ (e.g. /api/summary -> api/status.ts: Vercel's plan allows 12 functions), here too.
  const alias: Record<string, string> = {};
  try {
    for (const r of JSON.parse(readFileSync('vercel.json', 'utf8')).rewrites ?? []) {
      const from = String(r.source).match(/^\/api\/([a-z-]+)$/)?.[1];
      const to = String(r.destination).match(/^\/api\/([a-z-]+)/)?.[1];
      if (from && to) alias[from] = to;
    }
  } catch { /* no rewrites */ }
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const asked = req.url?.match(/^\/api\/([a-z-]+)\/?(?:\?|$)/)?.[1];
        if (!asked) return next();
        const name = alias[asked] ?? asked;
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const method = req.method ?? 'GET';
          const handler = mod[method] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end(JSON.stringify({ error: `${method} not allowed` }));
          }
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readBody(req));
          const out = await handler(new Request(`http://${req.headers.host}${req.url}`, { method, headers, body }));
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          server.ssrFixStacktrace(e as Error);
          console.error(e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
    },
  };
}

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((ok, fail) => {
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => parts.push(c));
    req.on('end', () => ok(Buffer.concat(parts)));
    req.on('error', fail);
  });

export default defineConfig(({ mode }) => {
  // .env / .env.local -> process.env for the server functions (all names, not only VITE_*).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  process.env.DE_LOCAL_STORE ??= '1';
  return {
    plugins: [react(), localApi()],
    build: {
      outDir: 'build',
    },
    server: { watch: { ignored: ['**/.local/**'] } },
  };
});
