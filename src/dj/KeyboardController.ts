import { DJMixer } from './DJMixer';

export type KeyState = 'down' | 'up';

export interface KeyboardStateListener {
  onPlaylistChange?: (deck: 'A' | 'B' | null) => void;
  onAltStateChange?: (isAlt: boolean) => void;
}

/**
 * High-performance, zero-allocation Keyboard Controller for the DJ Workstation.
 * 
 * Accurately tracks physical key states:
 * - Down ('d')
 * - Up ('u')
 * - Up-after-Down ('uad')
 * 
 * Filters OS-level key auto-repeat floods (e.repeat) to guarantee glitch-free audio,
 * handles multi-key modifier chords (Alt+R, Alt+I), CUE hold-to-play, and release-triggered transport.
 */
export class KeyboardController {
  private static instance: KeyboardController | null = null;

  private mixer: DJMixer;
  private keysDown: Set<string> = new Set();
  private isAltHeld: boolean = false;

  // Active in-deck playlist drawer
  public openPlaylistDeck: 'A' | 'B' | null = null;

  // Chord locks: prevents double-triggering when a chord completes
  private fChordLocked: boolean = false;
  private jChordLocked: boolean = false;

  // Trackpad Scratching State (Hold F for Deck A, Hold J for Deck B)
  private isFScratchHeld: boolean = false;
  private isJScratchHeld: boolean = false;
  private fScratchStartTime: number = 0;
  private jScratchStartTime: number = 0;
  private fDidScratch: boolean = false;
  private jDidScratch: boolean = false;
  private lastTrackpadMoveTime: number = 0;
  private lastPointerX: number | null = null;
  private lastPointerY: number | null = null;

  // Arrow Key Scratch State
  private arrowScratchAnimId: number | null = null;
  private lastArrowScratchTime: number = 0;
  private arrowScratchStartTime: number = 0;
  private lastArrowScratchVelocity: number = 0;
  private currentArrowVelocity: number = 0;
  private currentArrowDir: number = 0;

  private listeners: Set<KeyboardStateListener> = new Set();
  private isBound: boolean = false;

  private constructor() {
    this.mixer = DJMixer.getInstance();
  }

  public static getInstance(): KeyboardController {
    if (!KeyboardController.instance) {
      KeyboardController.instance = new KeyboardController();
    }
    return KeyboardController.instance;
  }

  private overlayEl: HTMLDivElement | null = null;

  public init() {
    if (this.isBound || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown, { capture: true });
    window.addEventListener('keyup', this.handleKeyUp, { capture: true });
    window.addEventListener('pointermove', this.handlePointerMove, { capture: true, passive: false });
    window.addEventListener('touchmove', this.handleTouchMove, { capture: true, passive: false });
    window.addEventListener('wheel', this.handleWheel, { capture: true, passive: false });
    window.addEventListener('blur', this.handleBlur);
    this.isBound = true;
  }

  public destroy() {
    if (!this.isBound || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown, { capture: true });
    window.removeEventListener('keyup', this.handleKeyUp, { capture: true });
    window.removeEventListener('pointermove', this.handlePointerMove, { capture: true });
    window.removeEventListener('touchmove', this.handleTouchMove, { capture: true });
    window.removeEventListener('wheel', this.handleWheel, { capture: true });
    window.removeEventListener('blur', this.handleBlur);
    this.keysDown.clear();
    this.isFScratchHeld = false;
    this.isJScratchHeld = false;
    this.fDidScratch = false;
    this.jDidScratch = false;
    this.lastPointerX = null;
    this.lastPointerY = null;
    this.stopArrowScratchLoop(false);
    if (this.mixer.deckA?.pitchBendDelta !== 0) {
      this.mixer.deckA?.pitchBend(0);
    }
    if (this.mixer.deckB?.pitchBendDelta !== 0) {
      this.mixer.deckB?.pitchBend(0);
    }
    this.removeOverlay();
    this.isBound = false;
  }

  public subscribe(listener: KeyboardStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyPlaylist(deck: 'A' | 'B' | null) {
    this.openPlaylistDeck = deck;
    this.listeners.forEach((l) => l.onPlaylistChange?.(deck));
  }

  private notifyAlt(isAlt: boolean) {
    this.isAltHeld = isAlt;
    this.listeners.forEach((l) => l.onAltStateChange?.(isAlt));
  }

  public setOpenPlaylist(deck: 'A' | 'B' | null) {
    this.notifyPlaylist(deck);
  }

  public isHoldingDeckKey(deck: 'A' | 'B'): boolean {
    return deck === 'A' ? this.keysDown.has('r') : this.keysDown.has('i');
  }

  public onSongLoaded(deck: 'A' | 'B') {
    if (!this.isHoldingDeckKey(deck)) {
      this.notifyPlaylist(null);
    }
  }

  private handleBlur = () => {
    // Reset key states if window loses focus
    this.keysDown.clear();
    this.notifyAlt(false);
    this.stopArrowScratchLoop(false);

    if (this.mixer.deckA?.pitchBendDelta !== 0) {
      this.mixer.deckA?.pitchBend(0);
    }
    if (this.mixer.deckB?.pitchBendDelta !== 0) {
      this.mixer.deckB?.pitchBend(0);
    }

    if (this.isFScratchHeld) {
      this.isFScratchHeld = false;
      this.mixer.deckA?.releaseScratch(this.fDidScratch);
      this.fDidScratch = false;
    }
    if (this.isJScratchHeld) {
      this.isJScratchHeld = false;
      this.mixer.deckB?.releaseScratch(this.jDidScratch);
      this.jDidScratch = false;
    }
    this.releasePointerLock();
  };

  private requestPointerLock() {
    if (typeof document !== 'undefined') {
      document.body.classList.add('scratching-active');

      // Create a transparent, non-blocking fullscreen capture overlay if needed
      if (!this.overlayEl) {
        this.overlayEl = document.createElement('div');
        this.overlayEl.id = 'scratch-capture-overlay';
        this.overlayEl.style.cssText =
          'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;cursor:none;touch-action:none;background:transparent;user-select:none;pointer-events:all;';
        document.body.appendChild(this.overlayEl);
      }

      if (document.body.requestPointerLock && !document.pointerLockElement) {
        try {
          const promise = document.body.requestPointerLock();
          if (promise && typeof (promise as any).catch === 'function') {
            (promise as any).catch(() => {});
          }
        } catch (_) {}
      }
    }
  }

  private releasePointerLock() {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('scratching-active');
      this.removeOverlay();
      if (document.exitPointerLock && document.pointerLockElement) {
        try {
          document.exitPointerLock();
        } catch (_) {}
      }
    }
  }

  private removeOverlay() {
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
      this.overlayEl = null;
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Shield inputs & textareas
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

    const key = e.key.toLowerCase();

    // Allow standard browser reload shortcuts (Ctrl+R, Cmd+R, F5)
    if ((e.ctrlKey || e.metaKey) && key === 'r') {
      return;
    }
    if (e.key === 'F5') {
      return;
    }

    // CRITICAL: Filter OS auto-repeat flood. Holding any key will never flood events or stutter audio!
    // Note: '-' and '+' (and '=' which is unshifted +) are allowed to auto-repeat for smooth crossfader gliding
    if (e.repeat) {
      const isMinusOrPlus =
        ['-', '_', '+', '='].includes(key) ||
        ['Minus', 'Equal', 'NumpadSubtract', 'NumpadAdd'].includes(e.code);

      if (isMinusOrPlus) {
        // If F or J is held, pitch bend is active; do not repeat or move crossfader!
        if (
          this.keysDown.has('f') ||
          this.isFScratchHeld ||
          this.keysDown.has('j') ||
          this.isJScratchHeld
        ) {
          e.preventDefault();
          return;
        }
        // Otherwise allow repeat for continuous crossfader shifting!
      } else {
        // Keep event prevented so browser default repeat behavior does not scroll or glitch
        if (
          [
            'd', 'k', 'f', 'j', 'r', 'i', 'g', 'h', 't', 'u', 'v', 'n', ' ',
            'arrowup', 'arrowdown', 'arrowleft', 'arrowright'
          ].includes(key)
        ) {
          e.preventDefault();
        }
        return;
      }
    }

    this.keysDown.add(key);

    if (e.altKey || key === 'alt') {
      this.notifyAlt(true);
    }

    // Fullscreen / Drawer escape
    if (e.key === 'Escape') {
      if (this.openPlaylistDeck) {
        e.preventDefault();
        this.notifyPlaylist(null);
        return;
      }
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
      return;
    }

    // Hardware power check
    if (!this.mixer.isPoweredOn) return;

    const isDeckAHeld = this.keysDown.has('f') || this.isFScratchHeld;
    const isDeckBHeld = this.keysDown.has('j') || this.isJScratchHeld;

    // Arrow Key Scratch Shortcuts:
    // Hold F (Deck A) or Hold J (Deck B) + Left / Down Arrow -> Scratch Reverse
    // Hold F (Deck A) or Hold J (Deck B) + Right / Up Arrow -> Scratch Forward
    const isArrowLeft = key === 'arrowleft';
    const isArrowRight = key === 'arrowright';
    const isArrowUp = key === 'arrowup';
    const isArrowDown = key === 'arrowdown';
    const isArrowKey = isArrowLeft || isArrowRight || isArrowUp || isArrowDown;

    if (isArrowKey) {
      if (isDeckAHeld || isDeckBHeld) {
        e.preventDefault();
        if (isDeckAHeld) this.fDidScratch = true;
        if (isDeckBHeld) this.jDidScratch = true;
        this.startArrowScratchLoop();
        return;
      }
    }

    // Crossfader and Pitch Bend Shortcuts:
    // When F (Deck A) or J (Deck B) is held:
    // - '-' / '_' -> Pitch Bend - (Slow down playback)
    // - '+' / '=' -> Pitch Bend + (Speed up playback)
    // When neither F nor J is held:
    // - '-' / '_' -> Slide crossfader towards Deck A (Left)
    // - '+' / '=' -> Slide crossfader towards Deck B (Right)
    const isMinus =
      key === '-' ||
      key === '_' ||
      e.code === 'Minus' ||
      e.code === 'NumpadSubtract';

    const isPlus =
      key === '+' ||
      key === '=' ||
      e.code === 'Equal' ||
      e.code === 'NumpadAdd';

    if (isMinus) {
      e.preventDefault();
      if (isDeckAHeld || isDeckBHeld) {
        if (isDeckAHeld && this.mixer.deckA) {
          this.fChordLocked = true;
          this.mixer.deckA.pitchBend(-0.06);
        }
        if (isDeckBHeld && this.mixer.deckB) {
          this.jChordLocked = true;
          this.mixer.deckB.pitchBend(-0.06);
        }
        return;
      }

      const current = this.mixer.crossfaderPos;
      const step = 0.1;
      let next = Math.round((current - step) * 100) / 100;
      // Exact center detent snap: if within half a step of 0, lock directly to 0
      if (Math.abs(next) < 0.05) {
        next = 0;
      }
      this.mixer.setCrossfader(Math.max(-1, next));
      return;
    }

    if (isPlus) {
      e.preventDefault();
      if (isDeckAHeld || isDeckBHeld) {
        if (isDeckAHeld && this.mixer.deckA) {
          this.fChordLocked = true;
          this.mixer.deckA.pitchBend(0.06);
        }
        if (isDeckBHeld && this.mixer.deckB) {
          this.jChordLocked = true;
          this.mixer.deckB.pitchBend(0.06);
        }
        return;
      }

      const current = this.mixer.crossfaderPos;
      const step = 0.1;
      let next = Math.round((current + step) * 100) / 100;
      // Exact center detent snap: if within half a step of 0, lock directly to 0
      if (Math.abs(next) < 0.05) {
        next = 0;
      }
      this.mixer.setCrossfader(Math.min(1, next));
      return;
    }

    // Loop & Hot Cue Key Chords (1..4):
    // Loops:
    // - Deck A: Hold F + 1, 2, 3, 4 -> Toggle 1, 2, 4, 8 beat loops
    // - Deck B: Hold J + 1, 2, 3, 4 -> Toggle 1, 2, 4, 8 beat loops
    // Hot Cues:
    // - Deck A Add: Hold T + 1, 2, 3, 4 -> Set / Add C1, C2, C3, C4
    // - Deck B Add: Hold U + 1, 2, 3, 4 -> Set / Add C1, C2, C3, C4
    // - Deck A Play: Hold V + 1, 2, 3, 4 -> Play / Jump C1, C2, C3, C4
    // - Deck B Play: Hold N + 1, 2, 3, 4 -> Play / Jump C1, C2, C3, C4
    const loopBeatsMap: Record<string, number> = {
      '1': 1,
      '2': 2,
      '3': 4,
      '4': 8,
    };

    if (['1', '2', '3', '4'].includes(key)) {
      const cueId = parseInt(key, 10);

      // 1. Hot Cue Add / Set (T on Deck A, U on Deck B)
      if (this.keysDown.has('t')) {
        e.preventDefault();
        this.mixer.deckA?.setHotCue(cueId);
        return;
      }
      if (this.keysDown.has('u')) {
        e.preventDefault();
        this.mixer.deckB?.setHotCue(cueId);
        return;
      }

      // 2. Hot Cue Play / Trigger (V on Deck A, N on Deck B)
      if (this.keysDown.has('v')) {
        e.preventDefault();
        this.mixer.deckA?.playHotCue(cueId);
        return;
      }
      if (this.keysDown.has('n')) {
        e.preventDefault();
        this.mixer.deckB?.playHotCue(cueId);
        return;
      }

      // 3. Loops (F on Deck A, J on Deck B)
      if (this.keysDown.has('f') || this.isFScratchHeld) {
        e.preventDefault();
        const beats = loopBeatsMap[key];
        this.mixer.deckA?.toggleLoop(beats);
        this.fChordLocked = true; // Prevents releasing F from toggling play/pause or releasing scratch
        return;
      }
      if (this.keysDown.has('j') || this.isJScratchHeld) {
        e.preventDefault();
        const beats = loopBeatsMap[key];
        this.mixer.deckB?.toggleLoop(beats);
        this.jChordLocked = true; // Prevents releasing J from toggling play/pause or releasing scratch
        return;
      }
    }

    // Track Manager Keys: R (Deck A) & I (Deck B)
    // If playlist menu is open, pressing R or I closes it immediately
    if (key === 'r' || key === 'i') {
      e.preventDefault();
      if (this.openPlaylistDeck !== null) {
        this.notifyPlaylist(null);
        return;
      }
      this.notifyPlaylist(key === 'r' ? 'A' : 'B');
      return;
    }

    // Track Operations: 0..9 and Enter
    const activeDeckId: 'A' | 'B' | null =
      this.keysDown.has('r') ? 'A' : this.keysDown.has('i') ? 'B' : this.openPlaylistDeck;

    if (activeDeckId) {
      const deck = activeDeckId === 'A' ? this.mixer.deckA : this.mixer.deckB;
      const isAltDelete = e.altKey || this.isAltHeld || this.keysDown.has('alt');

      if (e.key === 'Enter') {
        e.preventDefault();
        this.mixer.openFileDialog(activeDeckId);
        return;
      }

      if (key === '0') {
        e.preventDefault();
        if (deck) {
          if (isAltDelete) {
            // Alt + R/I + 0: Delete current track
            if (deck.currentTrackIndex >= 0 && deck.currentTrackIndex < deck.playlist.length) {
              deck.removeTrack(deck.currentTrackIndex);
            }
          } else {
            // R/I + 0: Replay current track from beginning
            deck.seekTo(0);
            deck.play();
          }
        }
        return;
      }

      if (key >= '1' && key <= '9') {
        e.preventDefault();
        const num = parseInt(key, 10);
        const idx = num - 1;
        if (deck) {
          if (isAltDelete) {
            // Alt + R/I + 1..9: Delete track from playlist
            if (idx < deck.playlist.length) {
              deck.removeTrack(idx);
            }
          } else {
            // R/I + 1..9: Load track into deck
            if (idx < deck.playlist.length) {
              deck.loadTrackIndex(idx);
              this.onSongLoaded(activeDeckId);
            }
          }
        }
        return;
      }
    }

    // Transport Keys: F (Deck A) & J (Deck B)
    // Order matters: pressing Play while CUE is held locks continuous playback!
    if (key === 'f') {
      e.preventDefault();
      this.fChordLocked = false;
      this.isFScratchHeld = true;
      this.fScratchStartTime = performance.now();
      this.fDidScratch = false;
      this.lastTrackpadMoveTime = performance.now();
      this.lastPointerX = null;
      this.lastPointerY = null;
      this.requestPointerLock();

      const isMinusHeld = this.keysDown.has('-') || this.keysDown.has('_');
      const isPlusHeld = this.keysDown.has('+') || this.keysDown.has('=');
      const isArrowHeld =
        this.keysDown.has('arrowleft') ||
        this.keysDown.has('arrowright') ||
        this.keysDown.has('arrowup') ||
        this.keysDown.has('arrowdown');

      if (isMinusHeld) {
        this.fChordLocked = true;
        this.mixer.deckA?.pitchBend(-0.06);
      } else if (isPlusHeld) {
        this.fChordLocked = true;
        this.mixer.deckA?.pitchBend(0.06);
      }

      if (isArrowHeld) {
        this.fDidScratch = true;
        const dir = (this.keysDown.has('arrowright') || this.keysDown.has('arrowup')) ? 1 : -1;
        this.lastArrowScratchVelocity = dir * 520;
        this.startArrowScratchLoop();
      }

      if (this.keysDown.has('d') || this.keysDown.has('g') || this.mixer.deckA?.isCueAuditioning) {
        this.mixer.deckA?.togglePlay();
        this.fChordLocked = true;
      }
      return;
    }

    if (key === 'j') {
      e.preventDefault();
      this.jChordLocked = false;
      this.isJScratchHeld = true;
      this.jScratchStartTime = performance.now();
      this.jDidScratch = false;
      this.lastTrackpadMoveTime = performance.now();
      this.lastPointerX = null;
      this.lastPointerY = null;
      this.requestPointerLock();

      const isMinusHeld = this.keysDown.has('-') || this.keysDown.has('_');
      const isPlusHeld = this.keysDown.has('+') || this.keysDown.has('=');
      const isArrowHeld =
        this.keysDown.has('arrowleft') ||
        this.keysDown.has('arrowright') ||
        this.keysDown.has('arrowup') ||
        this.keysDown.has('arrowdown');

      if (isMinusHeld) {
        this.jChordLocked = true;
        this.mixer.deckB?.pitchBend(-0.06);
      } else if (isPlusHeld) {
        this.jChordLocked = true;
        this.mixer.deckB?.pitchBend(0.06);
      }

      if (isArrowHeld) {
        this.jDidScratch = true;
        const dir = (this.keysDown.has('arrowright') || this.keysDown.has('arrowup')) ? 1 : -1;
        this.lastArrowScratchVelocity = dir * 520;
        this.startArrowScratchLoop();
      }

      if (this.keysDown.has('k') || this.keysDown.has('h') || this.mixer.deckB?.isCueAuditioning) {
        this.mixer.deckB?.togglePlay();
        this.jChordLocked = true;
      }
      return;
    }

    // PLACE CUE Keys: D (Deck A) & K (Deck B)
    // Drops / places CUE at current position (without stopping playback!)
    if (key === 'd') {
      e.preventDefault();
      this.mixer.deckA?.setCue();
      return;
    }

    if (key === 'k') {
      e.preventDefault();
      this.mixer.deckB?.setCue();
      return;
    }

    // PLAY CUE Keys: G (Deck A) & H (Deck B)
    // Always jumps to stored CUE point and plays while held (does not place cue!)
    if (key === 'g') {
      e.preventDefault();
      this.mixer.deckA?.playCueDown();
      return;
    }

    if (key === 'h') {
      e.preventDefault();
      this.mixer.deckB?.playCueDown();
      return;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

    const key = e.key.toLowerCase();

    // Ignore browser reload shortcuts
    if ((e.ctrlKey || e.metaKey) && key === 'r') {
      return;
    }
    if (e.key === 'F5') {
      return;
    }

    this.keysDown.delete(key);

    if (key === 'alt' || !e.altKey) {
      this.notifyAlt(false);
      // Releasing Alt while playlist is open closes the playlist menu (e.g. Alt+R, Alt+I)
      if (this.openPlaylistDeck !== null) {
        this.notifyPlaylist(null);
      }
    }

    if (!this.mixer.isPoweredOn) return;

    // Arrow Key Release
    const isArrowLeft = key === 'arrowleft';
    const isArrowRight = key === 'arrowright';
    const isArrowUp = key === 'arrowup';
    const isArrowDown = key === 'arrowdown';
    const isArrowKey = isArrowLeft || isArrowRight || isArrowUp || isArrowDown;
    if (isArrowKey) {
      const anyArrowRemaining =
        this.keysDown.has('arrowleft') ||
        this.keysDown.has('arrowright') ||
        this.keysDown.has('arrowup') ||
        this.keysDown.has('arrowdown');
      if (!anyArrowRemaining) {
        this.stopArrowScratchLoop(true);
      }
    }

    // Pitch Bend Release: '-' or '+'
    const isMinus =
      key === '-' ||
      key === '_' ||
      e.code === 'Minus' ||
      e.code === 'NumpadSubtract';

    const isPlus =
      key === '+' ||
      key === '=' ||
      e.code === 'Equal' ||
      e.code === 'NumpadAdd';

    if (isMinus || isPlus) {
      if (this.mixer.deckA?.pitchBendDelta !== 0) {
        this.mixer.deckA?.pitchBend(0);
      }
      if (this.mixer.deckB?.pitchBendDelta !== 0) {
        this.mixer.deckB?.pitchBend(0);
      }
    }

    // Track Manager Release: releasing R or I closes the playlist menu
    if (key === 'r' || key === 'i') {
      e.preventDefault();
      if (this.openPlaylistDeck !== null) {
        this.notifyPlaylist(null);
      }
      return;
    }

    // Transport Click (Up-after-Down): triggers Play/Pause when button comes back UP
    if (key === 'f') {
      e.preventDefault();
      if (this.mixer.deckA?.pitchBendDelta !== 0) {
        this.mixer.deckA?.pitchBend(0);
      }
      if (!this.keysDown.has('j') && !this.isJScratchHeld) {
        this.stopArrowScratchLoop(true);
      }
      const holdDuration = performance.now() - this.fScratchStartTime;
      const scratched = this.fDidScratch;
      this.isFScratchHeld = false;
      this.fDidScratch = false;
      this.releasePointerLock();

      if (!this.fChordLocked) {
        if (scratched) {
          // User swiped/scratched: release platter with inertia coasting & audio spinback acoustics
          this.mixer.deckA?.releaseScratch(true);
        } else if (holdDuration < 300) {
          // Quick tap (< 300ms) with no trackpad movement: toggle Play / Pause!
          this.mixer.deckA?.releaseScratch(false);
          this.mixer.deckA?.togglePlay();
        } else {
          // Held stationary without scratching: simply release hand from platter
          this.mixer.deckA?.releaseScratch(false);
        }
      } else {
        // Chord was activated while F was held (e.g. F+1..4 for loops, F+ -/+ for bend): smoothly release platter hold
        this.mixer.deckA?.releaseScratch(false);
      }
      this.fChordLocked = false;
      return;
    }

    if (key === 'j') {
      e.preventDefault();
      if (this.mixer.deckB?.pitchBendDelta !== 0) {
        this.mixer.deckB?.pitchBend(0);
      }
      if (!this.keysDown.has('f') && !this.isFScratchHeld) {
        this.stopArrowScratchLoop(true);
      }
      const holdDuration = performance.now() - this.jScratchStartTime;
      const scratched = this.jDidScratch;
      this.isJScratchHeld = false;
      this.jDidScratch = false;
      this.releasePointerLock();

      if (!this.jChordLocked) {
        if (scratched) {
          // User swiped/scratched: release platter with inertia coasting & audio spinback acoustics
          this.mixer.deckB?.releaseScratch(true);
        } else if (holdDuration < 300) {
          // Quick tap (< 300ms) with no trackpad movement: toggle Play / Pause!
          this.mixer.deckB?.releaseScratch(false);
          this.mixer.deckB?.togglePlay();
        } else {
          // Held stationary without scratching: simply release hand from platter
          this.mixer.deckB?.releaseScratch(false);
        }
      } else {
        // Chord was activated while J was held (e.g. J+1..4 for loops, J+ -/+ for bend): smoothly release platter hold
        this.mixer.deckB?.releaseScratch(false);
      }
      this.jChordLocked = false;
      return;
    }

    // PLAY CUE Release: G (Deck A) & H (Deck B)
    // Releasing key springs back to cue point and pauses
    if (key === 'g') {
      e.preventDefault();
      this.mixer.deckA?.cueUp();
      return;
    }

    if (key === 'h') {
      e.preventDefault();
      this.mixer.deckB?.cueUp();
      return;
    }
  };

  /**
   * Trackpad / Mouse pointer movement handler while holding F (Deck A) or J (Deck B).
   * Supports both movementX/Y (relative) and clientX/Y deltas (absolute position fallback).
   * Upward swipe (movementY < 0) pushes record forward (positive degrees).
   * Downward swipe (movementY > 0) pulls record backwards (negative degrees).
   */
  private handlePointerMove = (e: MouseEvent | PointerEvent) => {
    if (!this.isFScratchHeld && !this.isJScratchHeld) return;
    if (!this.mixer.isPoweredOn) return;

    const now = performance.now();
    const dt = Math.max(0.008, Math.min(0.05, (now - this.lastTrackpadMoveTime) / 1000));
    this.lastTrackpadMoveTime = now;

    let mx = e.movementX;
    let my = e.movementY;

    // Fallback: If movementX / movementY are zero or not provided by browser/OS, compute from clientX/Y
    if (this.lastPointerX !== null && this.lastPointerY !== null) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      if (mx === undefined || (mx === 0 && dx !== 0)) mx = dx;
      if (my === undefined || (my === 0 && dy !== 0)) my = dy;
    }
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (!mx) mx = 0;
    if (!my) my = 0;

    // Zero-deadband sensitivity: even 1 pixel movement triggers vinyl scratch
    if (Math.abs(mx) < 0.05 && Math.abs(my) < 0.05) return;

    // Upward trackpad motion (-my) advances the disc; downward (+my) reverses the disc
    // Rightward trackpad motion (+mx) advances the disc; leftward (-mx) reverses the disc
    const deltaDegrees = (-my * 2.0) + (mx * 1.4);

    if (this.isFScratchHeld && this.mixer.deckA) {
      this.fDidScratch = true;
      this.mixer.deckA.scratchRotate(deltaDegrees, dt);
    }

    if (this.isJScratchHeld && this.mixer.deckB) {
      this.jDidScratch = true;
      this.mixer.deckB.scratchRotate(deltaDegrees, dt);
    }
  };

  /**
   * Touchmove handler for trackpads/touch devices.
   */
  private handleTouchMove = (e: TouchEvent) => {
    if (!this.isFScratchHeld && !this.isJScratchHeld) return;
    if (!this.mixer.isPoweredOn) return;
    if (e.touches.length === 0) return;

    const touch = e.touches[0];
    const now = performance.now();
    const dt = Math.max(0.008, Math.min(0.05, (now - this.lastTrackpadMoveTime) / 1000));
    this.lastTrackpadMoveTime = now;

    let mx = 0;
    let my = 0;
    if (this.lastPointerX !== null && this.lastPointerY !== null) {
      mx = touch.clientX - this.lastPointerX;
      my = touch.clientY - this.lastPointerY;
    }
    this.lastPointerX = touch.clientX;
    this.lastPointerY = touch.clientY;

    if (Math.abs(mx) < 0.05 && Math.abs(my) < 0.05) return;

    const deltaDegrees = (-my * 1.8) + (mx * 1.2);

    if (this.isFScratchHeld && this.mixer.deckA) {
      this.fDidScratch = true;
      this.mixer.deckA.scratchRotate(deltaDegrees, dt);
    }

    if (this.isJScratchHeld && this.mixer.deckB) {
      this.jDidScratch = true;
      this.mixer.deckB.scratchRotate(deltaDegrees, dt);
    }
  };

  /**
   * Trackpad two-finger scroll / mouse wheel handler while holding F or J.
   * Enables continuous rotational scratch gesture via trackpad 2-finger swiping.
   */
  private handleWheel = (e: WheelEvent) => {
    if (!this.isFScratchHeld && !this.isJScratchHeld) return;
    if (!this.mixer.isPoweredOn) return;

    e.preventDefault();

    const now = performance.now();
    const dt = Math.max(0.008, Math.min(0.05, (now - this.lastTrackpadMoveTime) / 1000));
    this.lastTrackpadMoveTime = now;

    // Normalize deltaMode: 0 = pixels, 1 = lines, 2 = pages
    const mult = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 240 : 1;
    const dx = (e.deltaX || 0) * mult;
    const dy = (e.deltaY || 0) * mult;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;

    // Two-finger scroll up (dy < 0) pushes record forward; scroll down (dy > 0) pulls reverse
    const deltaDegrees = (-dy * 1.2) + (dx * 0.8);

    if (this.isFScratchHeld && this.mixer.deckA) {
      this.fDidScratch = true;
      this.mixer.deckA.scratchRotate(deltaDegrees, dt);
    }

    if (this.isJScratchHeld && this.mixer.deckB) {
      this.jDidScratch = true;
      this.mixer.deckB.scratchRotate(deltaDegrees, dt);
    }
  };

  /**
   * Continuous scratch animation loop for arrow keys while holding F (Deck A) or J (Deck B).
   * Upward/Rightward motion pushes record forward (positive degrees).
   * Downward/Leftward motion pulls record backward (negative degrees).
   */
  private startArrowScratchLoop() {
    if (this.arrowScratchAnimId !== null) return;
    this.lastArrowScratchTime = performance.now();
    this.arrowScratchStartTime = performance.now();
    this.currentArrowDir = 0;

    // Initialize physical rotational momentum from active deck if it was already in motion
    const isAHeld = this.keysDown.has('f') || this.isFScratchHeld;
    const isBHeld = this.keysDown.has('j') || this.isJScratchHeld;
    if (isAHeld && this.mixer.deckA?.isInertiaCoasting) {
      this.currentArrowVelocity = this.mixer.deckA.lastScratchVelocity;
    } else if (isBHeld && this.mixer.deckB?.isInertiaCoasting) {
      this.currentArrowVelocity = this.mixer.deckB.lastScratchVelocity;
    } else {
      this.currentArrowVelocity = 0;
    }

    const loop = (now: number) => {
      if (!this.mixer.isPoweredOn) {
        this.stopArrowScratchLoop(false);
        return;
      }

      const isA = this.keysDown.has('f') || this.isFScratchHeld;
      const isB = this.keysDown.has('j') || this.isJScratchHeld;

      let dir = 0;
      if (this.keysDown.has('arrowright') || this.keysDown.has('arrowup')) dir += 1;
      if (this.keysDown.has('arrowleft') || this.keysDown.has('arrowdown')) dir -= 1;

      if (dir === 0 || (!isA && !isB)) {
        this.stopArrowScratchLoop(true);
        return;
      }

      // Reset stroke timer whenever direction reverses to prevent runaway speed accumulation
      if (dir !== this.currentArrowDir) {
        this.currentArrowDir = dir;
        this.arrowScratchStartTime = now;
      }

      const dt = Math.max(0.008, Math.min(0.04, (now - this.lastArrowScratchTime) / 1000));
      this.lastArrowScratchTime = now;

      const strokeElapsed = (now - this.arrowScratchStartTime) / 1000;
      // Controlled, tight stroke velocity during rapid cuts (~300 deg/s):
      // Only accelerates to high spinback/push speeds (up to 820 deg/s) if held continuously for > 180ms:
      let targetSpeed = 300;
      if (strokeElapsed > 0.18) {
        targetSpeed = Math.min(820, 300 + (strokeElapsed - 0.18) * 1100);
      }
      const targetVelocity = dir * targetSpeed;

      // Realistic Physical Turntable Momentum & Turnaround Torque:
      // Snappy, tight turnaround braking: ~62000 deg/s^2 (~10-14ms) so the vinyl does not drift or overshoot
      const isReversing =
        (this.currentArrowVelocity > 30 && targetVelocity < -30) ||
        (this.currentArrowVelocity < -30 && targetVelocity > 30);

      const torque = isReversing ? 62000 : 42000;
      const maxDeltaV = torque * dt;

      if (Math.abs(targetVelocity - this.currentArrowVelocity) <= maxDeltaV) {
        this.currentArrowVelocity = targetVelocity;
      } else {
        const sign = targetVelocity > this.currentArrowVelocity ? 1 : -1;
        this.currentArrowVelocity += sign * maxDeltaV;
      }

      const deltaDegrees = this.currentArrowVelocity * dt;
      this.lastArrowScratchVelocity = this.currentArrowVelocity;

      if (isA && this.mixer.deckA) {
        this.fDidScratch = true;
        this.mixer.deckA.scratchRotate(deltaDegrees, dt);
      }
      if (isB && this.mixer.deckB) {
        this.jDidScratch = true;
        this.mixer.deckB.scratchRotate(deltaDegrees, dt);
      }

      this.arrowScratchAnimId = requestAnimationFrame(loop);
    };

    this.arrowScratchAnimId = requestAnimationFrame(loop);
  }

  private stopArrowScratchLoop(allowInertia: boolean = true) {
    if (this.arrowScratchAnimId !== null) {
      cancelAnimationFrame(this.arrowScratchAnimId);
      this.arrowScratchAnimId = null;
    }

    const velocity = this.currentArrowVelocity || this.lastArrowScratchVelocity;
    this.currentArrowVelocity = 0;
    this.lastArrowScratchVelocity = 0;
    this.currentArrowDir = 0;

    if (allowInertia && Math.abs(velocity) > 130) {
      if (this.fDidScratch && this.mixer.deckA) {
        this.mixer.deckA.lastScratchVelocity = velocity;
        this.mixer.deckA.startInertialCoasting(velocity);
      }
      if (this.jDidScratch && this.mixer.deckB) {
        this.mixer.deckB.lastScratchVelocity = velocity;
        this.mixer.deckB.startInertialCoasting(velocity);
      }
    } else {
      if (this.fDidScratch && this.mixer.deckA) {
        this.mixer.deckA.releaseScratch(false);
      }
      if (this.jDidScratch && this.mixer.deckB) {
        this.mixer.deckB.releaseScratch(false);
      }
    }
  }
}

