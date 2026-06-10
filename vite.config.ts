import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['WQI.png'],
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 5242880 // 5 MB
        },
        manifest: {
          name: 'HYDROQUALIX-4™',
          short_name: 'HYDROQUALIX',
          description: 'Water Quality Index calculation and mapping tool.',
          theme_color: '#10b981',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'WQI.png',
              sizes: '192x192 512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) return 'react-core';
              if (id.includes('leaflet') || id.includes('react-leaflet')) return 'leaflet-maps';
              if (id.includes('recharts') || id.includes('d3')) return 'charts-lib';
              if (id.includes('xlsx')) return 'excel-lib';
              if (id.includes('jspdf') || id.includes('html-to-image')) return 'export-utils';
              if (id.includes('firebase')) return 'firebase-core';
              if (id.includes('lucide-react')) return 'icons';
              return 'vendor';
            }
          }
        }
      }
    }
  };
});
