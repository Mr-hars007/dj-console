import { useState, useEffect, useRef } from 'react';
import { DJMixer } from './dj/DJMixer';
import { DJHeader } from './components/DJHeader';
import { DJDeck } from './components/DJDeck';
import { DJMixerSection } from './components/DJMixerSection';
import { AudioRoutingConfigModal } from './components/AudioRoutingConfigModal';
import { RGB_THEMES } from './components/HardwareHeader';
import type { RGBTheme } from './components/HardwareHeader';
import { KeyboardController } from './dj/KeyboardController';


export function App() {
  const mixer = DJMixer.getInstance();
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [activeTheme, setActiveTheme] = useState<RGBTheme>(RGB_THEMES[0]);
  const [autoFullscreen, setAutoFullscreen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('dj_auto_fullscreen');
      if (stored !== null) return stored === 'true';
    }
    return false;
  });
  const [showAudioConfig, setShowAudioConfig] = useState<boolean>(false);

  const handleToggleAutoFullscreen = (val: boolean) => {
    setAutoFullscreen(val);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dj_auto_fullscreen', String(val));
    }
  };

  // Audio-reactive diffused underglow halo
  const [masterEnergy, setMasterEnergy] = useState<number>(0);
  const animFrame = useRef<number | null>(null);
  const [isPowerOn, setIsPowerOn] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('dj_power_state');
      if (stored !== null) return stored === 'true';
    }
    return mixer.isPoweredOn;
  });

  useEffect(() => {
    const unsub = mixer.subscribe(() => {
      setIsPowerOn(mixer.isPoweredOn);
    });
    return unsub;
  }, [mixer]);

  useEffect(() => {
    let smoothed = 0;
    const loop = () => {
      const level = mixer.getMasterVU();
      smoothed += (level - smoothed) * 0.15; // smooth damping
      setMasterEnergy(smoothed);
      animFrame.current = requestAnimationFrame(loop);
    };
    animFrame.current = requestAnimationFrame(loop);
    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [mixer]);

  // In-Deck Playlist drawer state & Alt key state driven by KeyboardController
  const [openPlaylistDeck, setOpenPlaylistDeck] = useState<'A' | 'B' | null>(null);
  const [isAltHeld, setIsAltHeld] = useState<boolean>(false);

  // Mobile / Single-Deck Mode State (Auto-detects < 1024px screens, plus manual toggle)
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });
  const [modeOverride, setModeOverride] = useState<'auto' | 'mobile' | 'desktop'>('auto');
  const [activeMobileDeck, setActiveMobileDeck] = useState<'A' | 'B'>('A');

  const isMobileMode = modeOverride === 'auto' ? isMobileScreen : modeOverride === 'mobile';

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleMobileMode = () => {
    setModeOverride((prev) => {
      const current = prev === 'auto' ? (isMobileScreen ? 'mobile' : 'desktop') : prev;
      return current === 'mobile' ? 'desktop' : 'mobile';
    });
  };

  // Wire up dedicated, high-performance KeyboardController
  useEffect(() => {
    const keyboardController = KeyboardController.getInstance();
    keyboardController.init();

    const unsubscribe = keyboardController.subscribe({
      onPlaylistChange: (deck) => {
        setOpenPlaylistDeck(deck);
      },
      onAltStateChange: (alt) => {
        setIsAltHeld(alt);
      },
    });

    return () => {
      unsubscribe();
      keyboardController.destroy();
    };
  }, []);

  const handleStart = async () => {
    // Enter fullscreen mode if requested
    if (autoFullscreen) {
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (err) {
          console.warn('Fullscreen request failed:', err);
        }
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        try {
          await (document.documentElement as any).webkitRequestFullscreen();
        } catch (err) {
          console.warn('Webkit fullscreen failed:', err);
        }
      }
    }

    await mixer.initialize();
    setHasStarted(true);
  };

  // Diffused reactive underglow calculation (Dual-zone Deck A + Deck B glow)
  const glowRadius = Math.round(30 + masterEnergy * 50);
  const glowSpread = Math.round(6 + masterEnergy * 24);
  const glowOpacity = (0.25 + masterEnergy * 0.45).toFixed(2);
  const diffusedBoxShadow =
    !isPowerOn
      ? '0 20px 60px rgba(0, 0, 0, 0.98)'
      : activeTheme.id === 'stealth'
      ? '0 25px 60px rgba(0, 0, 0, 0.95)'
      : `-25px 0 ${glowRadius}px ${glowSpread}px ${activeTheme.glowA.replace(
          '0.45',
          glowOpacity
        )}, 25px 0 ${glowRadius}px ${glowSpread}px ${activeTheme.glowB.replace(
          '0.45',
          glowOpacity
        )}, 0 30px 80px rgba(0, 0, 0, 0.95)`;

  return (
    <div className="w-full h-screen max-h-screen bg-[#07080b] text-neutral-200 font-mono flex flex-col p-0 select-none overflow-hidden">
      {/* Landing Page Standby: Audio Routing, Headphone Preview, Fullscreen & Power On */}
      {!hasStarted && (
        <AudioRoutingConfigModal
          isStandbyMode={true}
          accentColor={activeTheme.colorA}
          onPowerOn={handleStart}
          autoFullscreen={autoFullscreen}
          onChangeAutoFullscreen={handleToggleAutoFullscreen}
        />
      )}

      {/* Live Audio Routing & Headphone Preview Settings Drawer */}
      {hasStarted && showAudioConfig && (
        <AudioRoutingConfigModal
          isStandbyMode={false}
          accentColor={activeTheme.colorA}
          onClose={() => setShowAudioConfig(false)}
        />
      )}

      {/* Top Header - Translucent & Edge-to-Edge with Reactive RGB */}
      <DJHeader
        activeTheme={activeTheme}
        onSelectTheme={setActiveTheme}
        masterEnergy={masterEnergy}
        onOpenAudioConfig={() => setShowAudioConfig(true)}
        isMobileMode={isMobileMode}
        onToggleMobileMode={handleToggleMobileMode}
        activeMobileDeck={activeMobileDeck}
        onSelectMobileDeck={setActiveMobileDeck}
      />

      {/* Main Console Chassis with Diffused Reactive RGB Aura */}
      <main
        className="w-full flex-1 min-h-0 bg-[#07080b] p-2 sm:p-2.5 md:p-3 transition-shadow duration-150 overflow-hidden flex flex-col justify-between"
        style={{
          boxShadow: diffusedBoxShadow,
        }}
      >
        {isMobileMode ? (
          /* Mobile Compatible Layout: Exactly 1 Deck and 1 Set of Mixer Knobs and Slider */
          <div className="w-full flex-1 min-h-0 flex flex-col md:flex-row items-stretch gap-2 sm:gap-2.5 overflow-hidden">
            {/* The 1 Active Deck (Deck A or Deck B) */}
            <DJDeck
              key={activeMobileDeck}
              id={activeMobileDeck}
              deck={activeMobileDeck === 'A' ? mixer.deckA : mixer.deckB}
              accentColor={activeMobileDeck === 'A' ? activeTheme.colorA : activeTheme.colorB}
              isPlaylistOpen={openPlaylistDeck === activeMobileDeck}
              onPlaylistToggle={(open) => {
                KeyboardController.getInstance().setOpenPlaylist(open ? activeMobileDeck : null);
              }}
              isHoldingKey={isAltHeld}
              isPoweredOn={isPowerOn}
            />

            {/* The 1 Set of Mixer Knobs and Slider */}
            <DJMixerSection
              deckA={mixer.deckA}
              deckB={mixer.deckB}
              colorA={activeTheme.colorA}
              colorB={activeTheme.colorB}
              isSingleChannel={true}
              activeDeckId={activeMobileDeck}
              onSelectDeck={setActiveMobileDeck}
              isPoweredOn={isPowerOn}
            />
          </div>
        ) : (
          /* Main 3-Column DJ Layout: Deck A (Left) | Mixer (Center) | Deck B (Right) */
          <div className="w-full flex-1 min-h-0 flex flex-col lg:flex-row items-stretch gap-2.5 sm:gap-3 lg:gap-3.5 overflow-hidden">
            {/* Deck A (Left - Theme Color A) */}
            <DJDeck
              id="A"
              deck={mixer.deckA}
              accentColor={activeTheme.colorA}
              isPlaylistOpen={openPlaylistDeck === 'A'}
              onPlaylistToggle={(open) => {
                KeyboardController.getInstance().setOpenPlaylist(open ? 'A' : null);
              }}
              isHoldingKey={isAltHeld}
              isPoweredOn={isPowerOn}
            />

            {/* Central Mixer Section (Coordinated Color A + Color B) */}
            <DJMixerSection
              deckA={mixer.deckA}
              deckB={mixer.deckB}
              colorA={activeTheme.colorA}
              colorB={activeTheme.colorB}
              isPoweredOn={isPowerOn}
            />

            {/* Deck B (Right - Theme Color B) */}
            <DJDeck
              id="B"
              deck={mixer.deckB}
              accentColor={activeTheme.colorB}
              isPlaylistOpen={openPlaylistDeck === 'B'}
              onPlaylistToggle={(open) => {
                KeyboardController.getInstance().setOpenPlaylist(open ? 'B' : null);
              }}
              isHoldingKey={isAltHeld}
              isPoweredOn={isPowerOn}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

