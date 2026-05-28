import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function sanitizeGasUrl(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/[^\w\-./:?#&=%]+$/g, '');
}

const THEME_COLOR = '#7C4DFF';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gasTarget = sanitizeGasUrl(env.VITE_GAS_WEB_APP_URL || env.VITE_GOOGLE_SCRIPT_URL);

  /** @type {import('vite').ProxyOptions | undefined} */
  let gasProxy;
  if (gasTarget) {
    try {
      const gas = new URL(gasTarget);
      gasProxy = {
        target: gas.origin,
        changeOrigin: true,
        secure: true,
        rewrite: (pathname) => {
          const qs = pathname.includes('?') ? pathname.slice(pathname.indexOf('?')) : '';
          return gas.pathname + qs;
        }
      };
    } catch (err) {
      console.warn('[vite] Invalid GAS URL in .env — proxy disabled:', err);
    }
  }

  return {
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      proxy: gasProxy ? { '/api/gas': gasProxy } : undefined
    },
    preview: {
      host: true,
      port: 4174,
      strictPort: false,
      proxy: gasProxy ? { '/api/gas': gasProxy } : undefined
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['assets/school-logo.png', 'favicon.svg'],
        manifest: {
          name: 'โรงเรียนยางตลาดวิทยาคาร',
          short_name: 'เช็คชื่อ ยว.',
          description: 'ระบบเช็คชื่อนักเรียน โรงเรียนยางตลาดวิทยาคาร',
          theme_color: THEME_COLOR,
          background_color: THEME_COLOR,
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          lang: 'th',
          icons: [
            {
              src: '/assets/school-logo.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/assets/school-logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin.includes('googleapis.com'),
              handler: 'NetworkOnly'
            },
            {
              urlPattern: ({ url }) => url.origin.includes('google.com'),
              handler: 'NetworkOnly'
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'school-assets',
                expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ]
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ]
  };
});
