import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("exceljs")) {
              return "vendor-exceljs";
            }
            if (id.includes("three")) {
              return "vendor-three";
            }
            if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("jszip")) {
              return "vendor-export";
            }
            if (id.includes("react") || id.includes("react-dom") || id.includes("lucide-react")) {
              return "vendor-react";
            }
          }
        },
      },
    },
  },
});
