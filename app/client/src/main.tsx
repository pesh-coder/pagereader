import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// A reader left open across a deploy still references the previous build's
// wallet chunks, which no longer exist; reload once to pick up the new build.
window.addEventListener('vite:preloadError', event => {
  const key = 'pagestream-reloaded-for-update'
  if (sessionStorage.getItem(key) === location.href) return
  event.preventDefault()
  sessionStorage.setItem(key, location.href)
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
