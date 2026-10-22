import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'leaflet/dist/leaflet.css'
import { initializeAuth } from './services/apiClient.ts'
import './services/offlineSnapshot.ts'
import { initializePwaInstallation } from './services/pwaInstallation.ts'

// Capture installation events before authentication or React startup can delay the UI.
initializePwaInstallation()

if ('serviceWorker' in navigator && import.meta.env.PROD && window.isSecureContext) {
  const register = () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .catch((error: unknown) => console.error('Service worker registration failed', error))
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

async function bootstrap() {
  await initializeAuth()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // After a deployment the previous build's lazy chunks no longer exist; reload into the new build.
  window.addEventListener('vite:preloadError', () => window.location.reload())
}

void bootstrap()
