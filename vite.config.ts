import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: process.env.VITE_DISABLE_PWA === "true",
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        id: "/",
        name: "Vértice",
        short_name: "Vértice",
        description:
          "Dashboard financeiro pessoal para acompanhar gastos, receitas, contas e decisões financeiras.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#101212",
        background_color: "#101212",
        icons: [
          {
            src: "/icons/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: "vertice",
        globPatterns: ["**/*.{html,css,js,svg,png,ico,woff,woff2,webmanifest}"],
        globIgnores: ["**/exceljs*.js"],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: "index.html",
        navigateFallbackAllowlist: [/^\/$/, /^\/index\.html$/],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/exceljs[^/]*\.js$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "vertice-exceljs",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { charts: ["recharts"], motion: ["framer-motion"] },
      },
    },
  },
});
