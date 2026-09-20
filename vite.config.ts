import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: { "/ws": { target: "ws://localhost:7778", ws: true } },
  },
});
