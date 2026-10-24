import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves the site from /next-gas/.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/next-gas/",
  plugins: [react()],
});
