import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          'video-processing': [
            './src/client/modules/videoLoader.ts',
            './src/client/modules/clipEditor.ts',
          ],
          'ai-features': [
            './src/client/modules/aiAnalyzer.ts',
            './src/client/modules/captionEngine.ts',
          ],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
  },

  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to backend during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      '@modules': path.resolve(__dirname, './src/client/modules'),
      '@workers': path.resolve(__dirname, './src/client/workers'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },

  optimizeDeps: {
    include: ['gifenc'],
  },

  worker: {
    format: 'es',
  },

  plugins: [
    // Legacy browser support
    legacy({
      targets: ['defaults', 'not IE 11'],
    }),

    // PWA support for offline functionality
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'ClipCraft',
        short_name: 'ClipCraft',
        description: 'AI-powered video clipping tool',
        theme_color: '#3b82f6',
        background_color: '#181818',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^http:\/\/localhost:3000\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300, // 5 minutes
              },
            },
          },
        ],
      },
    }),
  ],
});
