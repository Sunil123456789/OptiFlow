import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const modulePath = id.split("node_modules/")[1];
          if (!modulePath) return "vendor";

          const parts = modulePath.split("/");
          const packageName = parts[0].startsWith("@") ? `${parts[0]}-${parts[1]}` : parts[0];

          if (packageName === "xlsx") return "xlsx";
          return `vendor-${packageName}`;
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
