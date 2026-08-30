import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        // Por omissão o service worker serve o index.html para QUALQUER
        // navegação sem correspondência em cache — incluindo `/api/...`
        // aberto diretamente no browser, que passava a devolver a app em vez
        // do JSON do servidor.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'CRM Vendas',
        short_name: 'CRM',
        description: 'Gestão comercial para equipas de terreno. Funciona sem rede.',
        lang: 'pt-PT',
        // Arranca na página de entrada, não na última visitada.
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        // A cor da barra do sistema quando instalada; segue o acento da app.
        theme_color: '#ff7a59',
        background_color: '#f5f8fa',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            // `maskable` é obrigatório para o Android não desenhar o ícone
            // dentro de um quadrado branco. Tem margem de segurança própria:
            // 30% de cada lado podem ser cortados pela máscara do sistema.
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
