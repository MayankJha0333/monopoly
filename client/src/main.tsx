import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './sunny.css';

// The game used to be called Sunnyport. Carry a returning player's saved
// character, settings and table over to the new keys, once.
function migrateSavedKeys() {
  try {
    for (const name of ['look', 'prefs', 'panel', 'session', 'music', 'muted', 'musicVolume']) {
      const old = localStorage.getItem(`sunnyport.${name}`);
      if (old !== null && localStorage.getItem(`rentrush.${name}`) === null) {
        localStorage.setItem(`rentrush.${name}`, old);
      }
      localStorage.removeItem(`sunnyport.${name}`);
    }
  } catch { /* private mode */ }
}
migrateSavedKeys();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
