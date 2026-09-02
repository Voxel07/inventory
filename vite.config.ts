import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { execFileSync } from 'node:child_process'

function getGitTag() {
  if (process.env.APP_VERSION && process.env.APP_VERSION.trim() !== '') {
    return process.env.APP_VERSION.trim()
  }
  if (process.env.VITE_APP_VERSION && process.env.VITE_APP_VERSION.trim() !== '') {
    return process.env.VITE_APP_VERSION.trim()
  }
  try {
    return execFileSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    try {
      return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return 'dev'
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getGitTag()),
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@mui') || id.includes('@emotion')) {
              return 'mui-vendor';
            }
            if (id.includes('recharts')) {
              return 'recharts-vendor';
            }
            if (id.includes('jspdf')) {
              return 'jspdf-vendor';
            }
          }
        }
      }
    }
  }
})
