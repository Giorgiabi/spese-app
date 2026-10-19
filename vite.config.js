import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Spese mensili',
        short_name: 'Spese',
        description: 'Spese, entrate e investimenti dagli estratti conto Intesa Sanpaolo',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#141413',
        theme_color: '#2a78d6',
        icons: [
          { src: 'icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icona-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
