import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3001,
    strictPort: true,
  },
  optimizeDeps: { exclude: ["cloudflare:workers"] },
  ssr: { external: ["cloudflare:workers", "node:sqlite"] },
  build: {
    rollupOptions: {
      // resolved by workerd at runtime; node builds cannot bundle it
      external: ["cloudflare:workers", "node:sqlite"],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
