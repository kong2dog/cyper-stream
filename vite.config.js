import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8081,
    open: true,
  },
  build: {
    lib: {
      entry: "src/index.js",
      name: "CyperStream",
      fileName: (format) => `cyper-stream.${format}.js`,
    },
    rollupOptions: {
      // Ensure we bundle dependencies or externalize them based on requirement.
      // For a standalone lib, we might want to bundle them, but they are large.
      // User asked for a "Library", usually implies standalone.
      // I will bundle them for "CyperStream" ease of use.
    },
  },
});
