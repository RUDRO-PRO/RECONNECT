import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [VitePWA({
    registerType: "autoUpdate",
    manifestFilename: "manifest.webmanifest",
    includeAssets: ["icons/apple-touch-icon.png"],
    manifest: {
      id: "/",
      name: "Reconnect",
      short_name: "Reconnect",
      description: "Bridging the Talent Gap — Where Builders Connect & Form Winning Teams",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0b0f17",
      theme_color: "#0b0f17",
      lang: "en",
      categories: ["social", "productivity"],
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      navigateFallback: "/index.html",
      navigateFallbackDenylist: [/^\/api/, /^\/\.well-known/],
      globPatterns: ["**/*.{js,css,html,png,ico,webmanifest}"],
      globIgnores: ["**/.well-known/**"],
      cleanupOutdatedCaches: true,
      // Private API data and Digital Asset Links must always reach the network.
      runtimeCaching: [],
    },
  })],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
