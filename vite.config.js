import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replace 'tnn-platform' with your actual GitHub repo name
export default defineConfig({
  plugins: [react()],
  base: '/tnn-platform/',
})
