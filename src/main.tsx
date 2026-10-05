import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'leaflet/dist/leaflet.css'
import { initializeAuth } from './services/apiClient.ts'

async function bootstrap() {
  await initializeAuth()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // After a deployment the previous build's lazy chunks no longer exist; reload into the new build.
  window.addEventListener('vite:preloadError', () => window.location.reload())

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
  }
}

void bootstrap()
