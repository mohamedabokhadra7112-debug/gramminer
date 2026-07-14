import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// ── Code protection ──────────────────────────────────────────────
// Disable right-click context menu
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Block common devtools shortcuts: F12, Ctrl/Cmd+Shift+I, Ctrl/Cmd+U,
// Ctrl/Cmd+Shift+C, Ctrl/Cmd+Shift+J, Ctrl/Cmd+Shift+K
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (
    e.key === 'F12' ||
    (ctrl && e.shiftKey && ['i', 'I', 'c', 'C', 'j', 'J', 'k', 'K'].includes(e.key)) ||
    (ctrl && ['u', 'U'].includes(e.key))
  ) {
    e.preventDefault();
    e.stopPropagation();
  }
});
// ─────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(<App />);
