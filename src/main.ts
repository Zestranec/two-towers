/// <reference types="vite/client" />

import { Game } from './Game';

// Prevent all native scrolling and gestures
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

// Boot the game once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new Game());
} else {
  new Game();
}
