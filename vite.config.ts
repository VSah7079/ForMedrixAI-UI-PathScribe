import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Version is read here so package.json stays the single source of truth and
// `npm version` is the only place a release number is ever typed. Resolved
// against __dirname rather than cwd, so it holds regardless of where the
// build is invoked from.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@components': path.resolve(__dirname, 'src/components'),
        '@pages':      path.resolve(__dirname, 'src/pages'),
        '@theme':      path.resolve(__dirname, 'src/theme'),
        '@app-types':  path.resolve(__dirname, 'src/types'),
        '@':           path.resolve(__dirname, 'src'),
        '@hooks':      path.resolve(__dirname, 'src/hooks'),
        '@contexts':   path.resolve(__dirname, 'src/contexts'),
      },
    },
    // Without this, Vite's dependency scanner auto-discovers EVERY .html
    // file in the project as a potential entry point — including
    // docs/Pathscribe_Worklist_User_Guide.html and
    // docs/Specs/qc_module_prototype.html, neither of which is a real app
    // entry, and one or both of which has malformed markup that crashes
    // the scanner outright ("Failed to run dependency scan"). Scoping
    // explicitly to the real entry point is the fix, independent of
    // whatever's actually wrong in those docs files.
    optimizeDeps: {
      entries: ['index.html'],
      // Batch 371: pre-bundle these at start-up. They're reached only through
      // lazily loaded modules (single sign-on, live updates), so Vite found
      // them mid-session, re-bundled, and the open page failed with
      // "504 (Outdated Optimize Dep)" for oidc-client-ts.
      include: ['oidc-client-ts', '@microsoft/signalr'],
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      proxy: {

        // ── Anthropic (Claude) ─────────────────────────────────────────────
        // Client calls: POST /api/ai/anthropic/v1/messages
        // Forwards to:  https://api.anthropic.com/v1/messages
        '/api/ai/anthropic': {
          target:       'https://api.anthropic.com',
          changeOrigin: true,
          secure:       true,
          rewrite:      (p: string) => p.replace(/^\/api\/ai\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-api-key', env.AI_API_KEY ?? '');
              proxyReq.setHeader('anthropic-version', '2023-06-01');
              proxyReq.removeHeader('origin');
            });
          },
        },

        // ── Gemini (Google) ────────────────────────────────────────────────
        // Client calls: POST /api/ai/gemini/generate?model=gemini-1.5-flash
        // Forwards to:  https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=...
        //
        // Using a clean /generate path avoids the colon in the client URL
        // (gemini-1.5-flash:generateContent) which confuses Vite's proxy router.
        // The colon is constructed server-side in the rewrite function instead.
        '/api/ai/gemini/generate': {
          target:       'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          secure:       true,
          rewrite: (p: string) => {
            const url    = new URL(p, 'http://localhost');
            const model  = url.searchParams.get('model') ?? 'gemini-1.5-flash';
            const apiKey = env.GEMINI_API_KEY ?? '';
            return `/v1beta/models/${model}:generateContent?key=${apiKey}`;
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
            });
          },
        },

        // ── UMLS / NLM (SNOMED CT, terminology) ───────────────────────────
        // Client calls: GET /api/terminology/umls/search/current?string=...
        // Forwards to:  https://uts-ws.nlm.nih.gov/rest/search/current?string=...&apiKey=...
        '/api/terminology/umls': {
          target:       'https://uts-ws.nlm.nih.gov',
          changeOrigin: true,
          secure:       true,
          rewrite:      (p: string) => p.replace(/^\/api\/terminology\/umls/, '/rest'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const sep = req.url?.includes('?') ? '&' : '?';
              proxyReq.path += `${sep}apiKey=${env.UMLS_API_KEY ?? ''}`;
              proxyReq.removeHeader('origin');
            });
          },
        },

      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
              if (id.includes('@tiptap')) {
                return 'vendor-tiptap';
              }
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
            }
            return undefined;
          },
        },
      },
    },
  };
});
