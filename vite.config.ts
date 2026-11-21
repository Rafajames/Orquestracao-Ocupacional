import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base relativa: funciona em GitHub Pages (subcaminho) e em qualquer host estático.
export default defineConfig({ base: './', plugins: [react()], build: { chunkSizeWarningLimit: 900 } })
