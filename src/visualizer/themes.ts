import type { VisualizerTheme } from '../audio/types';


export const VISUALIZER_THEMES: VisualizerTheme[] = [
  {
    name: 'Cyberpunk Neon',
    id: 'cyberpunk',
    primary: '#00f3ff',     // Electric Cyan
    secondary: '#ff007f',   // Neon Magenta
    accent: '#ffe600',      // Cyber Yellow
    background: '#070913',  // Dark Deep Navy
  },
  {
    name: 'Matrix Emerald',
    id: 'matrix',
    primary: '#00ff66',     // Hacker Green
    secondary: '#00aa44',   // Deep Emerald
    accent: '#88ffaa',      // Pale Jade
    background: '#040b06',  // Void Green
  },
  {
    name: 'Solar Flare',
    id: 'solar',
    primary: '#ffaa00',     // Solar Gold
    secondary: '#ff3300',   // Blazing Orange
    accent: '#ff0055',      // Crimson Core
    background: '#120703',  // Molten Dark
  },
  {
    name: 'Deep Cosmic',
    id: 'cosmic',
    primary: '#a855f7',     // Nebula Violet
    secondary: '#38bdf8',   // Sky Cyan
    accent: '#ec4899',      // Galactic Pink
    background: '#090714',  // Deep Cosmos
  },
  {
    name: 'Monochrome Void',
    id: 'monochrome',
    primary: '#ffffff',     // Pure White
    secondary: '#888888',   // Gunmetal Grey
    accent: '#55aaff',      // Soft Blue
    background: '#050505',  // Pure Black
  },
];
