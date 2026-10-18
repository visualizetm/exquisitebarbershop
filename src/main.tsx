import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import '@fontsource-variable/jost/wght.css';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/legacy.css';
import './styles/base.css';
import './styles/kit.css';
import './styles/frame.css';
import './styles/pages.css';
import './styles/booking.css';
import './styles/motion.css';
import { initMotion } from './lib/motion';

initMotion();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
