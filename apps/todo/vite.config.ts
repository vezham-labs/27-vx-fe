import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { defineConfig } from 'vite'

const proxy = { '/api': 'http://127.0.0.1:47831' }
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'offline-shell',
      enforce: 'post',
      generateBundle(_, bundle) {
        const files = [
          '/',
          '/index.html',
          '/manifest.webmanifest',
          '/icon-192.png',
          '/icon-512.png',
          ...Object.keys(bundle)
            .filter(n => n !== 'index.html')
            .map(n => '/' + n)
        ]
        const cache =
          'vx-todo-' +
          createHash('sha256')
            .update(JSON.stringify(files))
            .digest('hex')
            .slice(0, 16)
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: `
 const name=${JSON.stringify(cache)};
 self.addEventListener('install',e=>e.waitUntil(caches.open(name).then(c=>c.addAll(${JSON.stringify(files)})).then(()=>self.skipWaiting())));
 self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('vx-todo-')&&k!==name).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
 self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;e.respondWith(caches.open(name).then(async c=>(await c.match(e.request.mode==='navigate'?'/index.html':e.request,{ignoreVary:true}))||fetch(e.request)))});
 `
        })
      }
    }
  ],
  resolve: { conditions: ['@vx/fe-kit', 'browser', 'development|production'] },
  server: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy }
})
