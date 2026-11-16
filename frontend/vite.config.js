import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  // The Spring Boot backend serves the built UI at /
  build: { outDir: '../backend/src/main/resources/static', emptyOutDir: true },
})
