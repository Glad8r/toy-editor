import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
    // Enable more verbose logging
  logLevel: 'info', // or 'warn', 'error', 'silent'
  clearScreen: false, // Keep previous output visible
})
