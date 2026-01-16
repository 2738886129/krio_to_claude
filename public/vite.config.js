import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

// 读取服务器配置
function getServerConfig() {
  try {
    const configPath = path.resolve(__dirname, '../config/server-config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return {
      host: config.server?.host || '0.0.0.0',
      port: config.server?.port || 3000,
      frontendPort: config.server?.frontendPort || 5173
    }
  } catch (e) {
    return { host: '0.0.0.0', port: 3000, frontendPort: 5173 }
  }
}

const serverConfig = getServerConfig()

export default defineConfig({
  plugins: [vue()],
  root: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  },
  server: {
    port: serverConfig.frontendPort || 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${serverConfig.port}`,
        changeOrigin: true
      }
    }
  }
})
