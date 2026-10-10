import React, { useRef, useState, useEffect } from 'react';
import type { DeckAudio } from '../dj/DeckAudio';
import { DJWaveform } from './DJWaveform';
import { DJJogwheel } from './DJJogwheel';
import { DJMixer } from '../dj/DJMixer';
import { KeyboardController } from '../dj/KeyboardController';
import { Play, Pause, SkipBack, SkipForward, Plus, ListMusic, Trash2, X } from 'lucide-react';
import { DJHardwareFader } from './DJHardwareFader';

interface DJDeckProps {
  id: 'A' | 'B';
  deck: DeckAudio | null;
  accentColor: string;
  isPlaylistOpen?: boolean;
  onPlaylistToggle?: (open: boolean) => void;
  isHoldingKey?: boolean;
  isPoweredOn?: boolean;
}

export const DJDeck: React.FC<DJDeckProps> = ({
  id,
  deck,
  accentColor,
  isPlaylistOpen,
  onPlaylistToggle,
  isHoldingKey = false,
  isPoweredOn = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const trackInfoRef = useRef<HTMLDivElement | null>(null);
  const pillBtnRef = useRef<HTMLButtonElement | null>(null);
  const mixer = DJMixer.getInstance();
  const [, setTick] = useState(0);
  const [localBendingDown, setLocalBendingDown] = useState(false);
  const [localBendingUp, setLocalBendingUp] = useState(false);
  const isBendingDown = localBendingDown || (deck?.pitchBendDelta ?? 0) < -0.01;
  const isBendingUp = localBendingUp || (deck?.pitchBendDelta ?? 0) > 0.01;
  const [localShowPlaylist, setLocalShowPlaylist] = useState(false);
  const showPlaylist = isPlaylistOpen !== undefined ? isPlaylistOpen : localShowPlaylist;
  const setShowPlaylist = (action: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof action === 'function' ? action(showPlaylist) : action;
    setLocalShowPlaylist(nextVal);
    onPlaylistToggle?.(nextVal);
  };

  const cueHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCueHeldRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (cueHoldTimerRef.current) clearTimeout(cueHoldTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const unsub = mixer.subscribe(() => {
      setTick((t) => (t + 1) | 0);
    });

    return () => {
      unsub();
    };
  }, [mixer]);

  useEffect(() => {
    if (!deck) return;
    deck.onTrackLoaded = () => {
      KeyboardController.getInstance().onSongLoaded(id);
    };
    return () => {
      deck.onTrackLoaded = undefined;
    };
  }, [deck, id]);

  // Close popover when clicking anywhere outside
  useEffect(() => {
    if (!showPlaylist) return;
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !trackInfoRef.current?.contains(target) &&
        !pillBtnRef.current?.contains(target)
      ) {
        setShowPlaylist(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [showPlaylist]);

  const wasFullscreenRef = useRef<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const openFilePicker = async () => {
    wasFullscreenRef.current = !!document.fullscreenElement;
    setShowPlaylist(false);

    // 1. Try modern File System Access API (does not trigger exitFullscreen in Chromium/Chrome)
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const handles = await (window as any).showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'Audio Files',
              accept: {
                'audio/*': ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.webm', '.opus'],
              },
            },
          ],
        });

        if (handles && handles.length > 0) {
          const files: File[] = [];
          for (const handle of handles) {
            try {
              files.push(await handle.getFile());
            } catch (_) {}
          }
          if (files.length > 0) {
            mixer.loadUserFiles(id, files);
          }
        }

        // Restore fullscreen if dropped by window manager
        if (wasFullscreenRef.current && !document.fullscreenElement) {
          try {
            await document.documentElement.requestFullscreen();
          } catch (_) {}
        }
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User closed/cancelled file picker without selecting
          if (wasFullscreenRef.current && !document.fullscreenElement) {
            try {
              await document.documentElement.requestFullscreen();
            } catch (_) {}
          }
          return;
        }
        // Fall back to input element if API failed for other reason
        console.warn('showOpenFilePicker failed, falling back to input:', err);
      }
    }

    // 2. Fallback to hidden input
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPlaylist(false);
    const files = e.target.files;
    if (files && files.length > 0) {
      mixer.loadUserFiles(id, files);
      e.target.value = '';
    }
    // Re-enter fullscreen immediately if active prior to opening file picker
    if (wasFullscreenRef.current && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const handleCancel = () => {
      if (wasFullscreenRef.current && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    input.addEventListener('cancel', handleCancel);
    return () => {
      input.removeEventListener('cancel', handleCancel);
    };
  }, []);

  // Seamless fallback: restore fullscreen on the very first document click if lost after file dialog
  useEffect(() => {
    const handleGlobalClick = () => {
      if (wasFullscreenRef.current && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
          wasFullscreenRef.current = false;
        }).catch(() => {});
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  // Drag and Drop handlers for instant in-fullscreen loading
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const dtFiles = e.dataTransfer.files;
    if (dtFiles && dtFiles.length > 0) {
      const audioFiles = Array.from(dtFiles).filter((f) =>
        f.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac|opus|webm)$/i.test(f.name)
      );
      if (audioFiles.length > 0) {
        mixer.loadUserFiles(id, audioFiles);
      }
    }
  };

  const isPlaying = deck?.isPlaying ?? false;
  const track = deck?.track;
  const tempoMult = deck?.tempoMultiplier ?? 1.0;
  const tempoPercent = (((tempoMult - 1.0) * 100)).toFixed(1);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex-1 min-h-0 flex flex-col justify-between rounded-xl border ${
        isDraggingOver ? 'border-dashed border-2' : 'border-[#232534]'
      } bg-[#0c0d13] p-2.5 sm:p-3 gap-2 sm:gap-2.5 overflow-hidden transition-colors`}
      style={{
        borderColor: isDraggingOver ? accentColor : undefined,
      }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm pointer-events-none p-4 text-center rounded-xl"
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-2 animate-bounce"
            style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
          >
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-mono font-black text-sm text-white tracking-wider">
            DROP AUDIO FILES TO LOAD INTO DECK {id}
          </span>
          <span className="font-mono text-[11px] text-neutral-400 mt-1">
            Instant load · Preserves Fullscreen mode
          </span>
        </div>
      )}

      {/* Hidden file input supporting multiple files */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Deck Header: Deck Badge + Clickable Track Info + Playlist Navigation */}
      <div className="relative flex items-center gap-2 sm:gap-2.5 pb-2 border-b border-[#1c1e28]">
        {/* Left Dynamic Deck / Album Art Badge Square (Locked to exact badge dimensions) */}
        <div
          className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex items-center justify-center shadow-md shrink-0 select-none border border-[#202230] transition-colors"
          style={{
            backgroundColor: !isPoweredOn
              ? '#10111a'
              : track?.artworkUrl
              ? '#050609'
              : accentColor,
          }}
          title={track?.artworkUrl ? `Deck ${id} Cover Art: ${track.title}` : `Deck ${id}`}
        >
          {track?.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt={track.title}
              className={`w-full h-full object-cover rounded-lg pointer-events-none select-none transition-opacity ${
                !isPoweredOn ? 'opacity-25 grayscale' : ''
              }`}
            />
          ) : (
            <span
              className={`font-mono font-black text-sm sm:text-base select-none transition-colors ${
                isPoweredOn ? 'text-black' : 'text-neutral-600'
              }`}
            >
              {id}
            </span>
          )}
        </div>

        {/* Center: Active Track Info & Quick Load */}
        <div
          ref={trackInfoRef}
          onClick={() => {
            if (!isPoweredOn) return;
            if (!deck || deck.playlist.length === 0) {
              openFilePicker();
            } else {
              setShowPlaylist((p) => !p);
            }
          }}
          className={`flex-1 min-w-0 h-11 sm:h-12 flex items-center justify-between px-3 rounded-lg border transition-all ${
            !isPoweredOn
              ? 'bg-[#090a10] border-[#181a24] text-neutral-600 cursor-default pointer-events-none select-none'
              : !deck || deck.playlist.length === 0
              ? 'bg-[#0e1017] border-[#202230] hover:bg-[#151722] hover:border-[#33364b] cursor-pointer'
              : 'bg-[#0e1017] border-[#202230] hover:bg-[#131520] hover:border-[#2d3044] cursor-pointer'
          } group`}
          title={
            !isPoweredOn
              ? 'Deck Off'
              : !deck || deck.playlist.length === 0
              ? 'Click to open File Explorer (Choose one or more tracks)'
              : 'Click to view / manage deck playlist'
          }
        >
          <div className="min-w-0 flex-1">
            <div
              className={`font-mono font-bold text-xs sm:text-sm truncate transition-colors leading-tight ${
                !isPoweredOn ? 'text-neutral-600' : 'text-neutral-100 group-hover:text-white'
              }`}
            >
              {track ? track.title : `CLICK TO LOAD TRACKS`}
            </div>
            <div
              className={`text-[10px] font-mono truncate flex items-center gap-1.5 leading-tight ${
                !isPoweredOn ? 'text-neutral-700' : 'text-neutral-500 group-hover:text-neutral-400'
              }`}
            >
              <span className="truncate">{track ? `${track.artist} · ${track.bpm} BPM` : 'Open File Explorer (Multi-file select)'}</span>
            </div>
          </div>
        </div>

        {/* Right: Track Skip & Add Track Controls */}
        <div className="flex items-center gap-1.5 shrink-0 h-11 sm:h-12">
          {/* Previous Track Button */}
          {deck && deck.playlist.length > 1 && (
            <button
              onClick={() => {
                if (!isPoweredOn) return;
                deck.prevTrack();
              }}
              className={`h-full px-2 rounded-lg border transition-all flex items-center justify-center ${
                !isPoweredOn
                  ? 'bg-[#090a10] border-[#181a24] text-neutral-600 cursor-default pointer-events-none shadow-none'
                  : 'bg-[#0e1017] hover:bg-[#181a26] border-[#202230] hover:border-[#383d58] text-neutral-300 hover:text-white cursor-pointer active:scale-95 shadow-sm'
              }`}
              title={isPoweredOn ? `Previous Track (Currently on ${deck.currentTrackIndex + 1} of ${deck.playlist.length})` : 'Deck Off'}
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Track Counter Pill / Dropdown Toggle */}
          {deck && deck.playlist.length > 0 && (
            <button
              ref={pillBtnRef}
              onClick={() => {
                if (!isPoweredOn) return;
                setShowPlaylist((p) => !p);
              }}
              className={`h-full px-2 rounded-lg border font-mono font-black text-[10px] sm:text-[11px] transition-all flex items-center justify-center gap-1 ${
                !isPoweredOn
                  ? 'bg-[#090a10] border-[#181a24] text-neutral-600 cursor-default pointer-events-none shadow-none'
                  : 'bg-[#0e1017] hover:bg-[#181a26] border-[#202230] hover:border-[#383d58] cursor-pointer shadow-sm'
              }`}
              style={{
                color: isPoweredOn ? accentColor : '#4b5563',
              }}
              title={isPoweredOn ? 'Click to toggle track queue list' : 'Deck Off'}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>{deck.currentTrackIndex + 1}/{deck.playlist.length}</span>
            </button>
          )}

          {/* Next Track Button */}
          {deck && deck.playlist.length > 1 && (
            <button
              onClick={() => {
                if (!isPoweredOn) return;
                deck.nextTrack();
              }}
              className={`h-full px-2 rounded-lg border transition-all flex items-center justify-center ${
                !isPoweredOn
                  ? 'bg-[#090a10] border-[#181a24] text-neutral-600 cursor-default pointer-events-none shadow-none'
                  : 'bg-[#0e1017] hover:bg-[#181a26] border-[#202230] hover:border-[#383d58] text-neutral-300 hover:text-white cursor-pointer active:scale-95 shadow-sm'
              }`}
              title={isPoweredOn ? `Next Track (Currently on ${deck.currentTrackIndex + 1} of ${deck.playlist.length})` : 'Deck Off'}
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Add / Upload More Tracks Button */}
          <button
            onClick={() => {
              if (!isPoweredOn) return;
              openFilePicker();
            }}
            className={`h-full px-2 sm:px-2.5 rounded-lg border transition-all flex items-center justify-center gap-1 ${
              !isPoweredOn
                ? 'bg-[#090a10] border-[#181a24] text-neutral-600 cursor-default pointer-events-none shadow-none'
                : 'bg-[#0e1017] hover:bg-[#181a26] border-[#202230] hover:border-[#383d58] text-neutral-400 hover:text-white cursor-pointer active:scale-95 shadow-sm'
            }`}
            title={isPoweredOn ? 'Upload audio files to this deck (Multi-file select supported)' : 'Deck Off'}
          >
            <Plus className={`w-3.5 h-3.5 ${isPoweredOn ? 'text-neutral-300' : 'text-neutral-600'}`} />
            <span className="text-[10px] font-bold hidden sm:inline">ADD</span>
          </button>
        </div>

        {/* Tracklist / Crate Dropdown Popover */}
        {showPlaylist && isPoweredOn && deck && (
          <div
            ref={popoverRef}
            className="absolute top-full left-0 right-0 mt-1 z-30 bg-[#0c0d16] border border-[#24273c] rounded-xl shadow-2xl p-2 max-h-56 overflow-y-auto backdrop-blur-md space-y-1"
          >
            <div className="flex items-center justify-between pb-1 px-1 border-b border-[#1c1e2d] text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <span>Deck {id} Playlist ({deck.playlist.length})</span>
                {isHoldingKey ? (
                  <span className="text-[9px] text-red-400 font-bold bg-red-950/80 border border-red-800/60 px-1.5 py-0.5 rounded animate-pulse">
                    ALT DELETE MODE: [1–9] DEL · [0] DEL CURRENT
                  </span>
                ) : (
                  <span className="text-[9px] text-neutral-400 font-mono">
                    [{id === 'A' ? 'R' : 'I'} + 1–9 Load · 0 Replay · Alt + 1–9 Del]
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={openFilePicker}
                  className="text-xs text-neutral-300 hover:text-white flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#181926] hover:bg-[#202234] cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
                <button
                  onClick={() => setShowPlaylist(false)}
                  className="text-neutral-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {deck.playlist.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-400 space-y-2">
                <div>No songs in Deck {id} playlist yet.</div>
                <button
                  onClick={openFilePicker}
                  className="px-3 py-1.5 rounded-lg bg-[#181926] hover:bg-[#202234] text-white font-mono text-xs inline-flex items-center gap-1.5 cursor-pointer border border-[#2e3250]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Songs from Device (or press Enter)</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1 pt-1">
                {deck.playlist.map((item, idx) => {
                  const isSelected = idx === deck.currentTrackIndex;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg transition-all text-xs cursor-pointer ${
                        isSelected
                          ? 'bg-[#181a2c] text-white border border-[#2e3250]'
                          : 'bg-[#0e1017] hover:bg-[#141624] text-neutral-300 hover:text-white border border-transparent'
                      } ${isHoldingKey ? 'hover:border-red-500/50' : ''}`}
                      onClick={() => {
                        if (isHoldingKey) {
                          deck.removeTrack(idx);
                        } else {
                          deck.loadTrackIndex(idx);
                          KeyboardController.getInstance().onSongLoaded(id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`font-mono font-bold text-[10px] w-5 text-center shrink-0 px-1 py-0.5 rounded border ${
                            isHoldingKey
                              ? 'bg-red-950/80 border-red-800 text-red-300'
                              : 'bg-neutral-900 border-neutral-800'
                          }`}
                          style={{
                            color: isHoldingKey
                              ? '#fca5a5'
                              : isSelected
                              ? accentColor
                              : '#9ca3af',
                          }}
                          title={isHoldingKey ? `Delete: Hold ${id === 'A' ? 'R' : 'I'} + ${idx + 1}` : `Load: ${id === 'A' ? 'R' : 'I'} + ${idx + 1}`}
                        >
                          {idx + 1}
                        </span>
                        {item.metadata.artworkUrl && (
                          <img
                            src={item.metadata.artworkUrl}
                            alt=""
                            className="w-7 h-7 rounded object-cover shrink-0 border border-[#23263b]"
                          />
                        )}
                        <div className="min-w-0 flex-1 truncate">
                          <div className="font-bold truncate">{item.metadata.title}</div>
                          <div className="text-[10px] text-neutral-500 truncate">
                            {Math.floor(item.metadata.duration / 60)}:
                            {Math.floor(item.metadata.duration % 60).toString().padStart(2, '0')} · {item.metadata.bpm} BPM
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isSelected && !isHoldingKey && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                            style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
                          >
                            LOADED
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deck.removeTrack(idx);
                          }}
                          className="text-neutral-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                          title="Remove track from deck playlist"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrolling Interactive Waveform Display */}
      <DJWaveform deck={deck} color={accentColor} isPoweredOn={isPoweredOn} />

      {/* Main Platter and Pitch Slider Section */}
      <div className="flex items-center justify-between gap-3.5 sm:gap-4 flex-1 min-h-0 py-1.5">
        {/* Flagship Large Jogwheel Platter */}
        <div className="flex-1 min-w-0 h-full flex items-center justify-center overflow-hidden">
          <DJJogwheel deck={deck} accentColor={accentColor} isPoweredOn={isPoweredOn} />
        </div>

        {/* Vertical Tempo / Pitch Fader Module */}
        <div className="flex flex-col items-center justify-between h-full max-h-80 sm:max-h-84 py-2 px-2 sm:py-2.5 sm:px-3 rounded-xl bg-[#08090f] border border-[#1e202d] shadow-inner shrink-0 w-22 min-[400px]:w-26 sm:w-32">
          <div className="flex flex-col items-center gap-1 w-full">
            <span className="text-[9px] font-mono text-neutral-400 font-bold uppercase tracking-wider">TEMPO</span>
            <div className="flex items-center gap-1">
              <div
                className={`text-[10px] font-mono font-black transition-colors ${
                  isPoweredOn ? 'text-neutral-200' : 'text-neutral-600'
                }`}
              >
                {Number(tempoPercent) > 0 ? `+${tempoPercent}%` : `${tempoPercent}%`}
              </div>
              {isPoweredOn && deck?.syncOutOfRange && (
                <span
                  className="text-[7.5px] font-mono font-black px-1 py-0.2 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40"
                  title="Target BPM exceeds allowed ±10% limit"
                >
                  LIMIT
                </span>
              )}
            </div>

            {/* Hardware Key Lock (Master Tempo) Switch */}
            <button
              onClick={() => {
                if (!isPoweredOn) return;
                deck?.toggleKeyLock();
              }}
              className={`w-full py-1 px-1.5 rounded-md font-mono font-bold text-[8.5px] flex items-center justify-center gap-1.5 select-none transition-all border ${
                !isPoweredOn
                  ? 'border-[#202230] bg-[#0c0d14] text-neutral-600 cursor-default'
                  : deck?.isKeyLockActive
                  ? 'border-transparent text-white cursor-pointer'
                  : 'border-[#262838] bg-[#121420] text-neutral-400 hover:text-neutral-200 hover:border-[#383d58] cursor-pointer'
              }`}
              style={{
                background: !isPoweredOn
                  ? undefined
                  : deck?.isKeyLockActive
                  ? `radial-gradient(circle at 50% 50%, ${accentColor}40 0%, ${accentColor}18 65%, #121422 100%)`
                  : undefined,
                boxShadow: !isPoweredOn
                  ? 'none'
                  : deck?.isKeyLockActive
                  ? `inset 0 0 10px ${accentColor}45, 0 0 8px ${accentColor}30`
                  : undefined,
                textShadow: !isPoweredOn
                  ? 'none'
                  : deck?.isKeyLockActive
                  ? `0 0 6px ${accentColor}`
                  : undefined,
              }}
              title={isPoweredOn ? 'Key Lock (Master Tempo): Preserve musical pitch when tempo changes' : 'Deck Off'}
            >
              <span
                className="w-1.5 h-1.5 rounded-full transition-all shrink-0"
                style={{
                  backgroundColor: !isPoweredOn
                    ? '#334155'
                    : deck?.isKeyLockActive
                    ? accentColor
                    : '#52525b',
                  boxShadow: isPoweredOn && deck?.isKeyLockActive ? `0 0 6px ${accentColor}` : undefined,
                }}
              />
              <span className="tracking-tight">KEY LOCK</span>
            </button>
          </div>

          {/* Pro DJ Hardware Pitch Fader */}
          <DJHardwareFader
            orientation="vertical"
            value={tempoMult}
            min={1.0 - (deck?.tempoLimit ?? 0.10)}
            max={1.0 + (deck?.tempoLimit ?? 0.10)}
            step={0.001}
            defaultValue={1.0}
            onChange={(v) => {
              if (!isPoweredOn) return;
              if (deck) {
                if (mixer.isSyncActive) {
                  mixer.setMasterSync(false);
                }
                deck.setTempoMultiplier(v);
              }
            }}
            accentColor={accentColor}
            scale="tempo"
            heightPx={145}
            widthPx={50}
            title="Pitch / Tempo Fader (-10% to +10%)"
            isPoweredOn={isPoweredOn}
          />

          {/* Large Accessible Tactile Pitch Bend Buttons (Consistent DJ Hardware Design with Backlit Keycaps) */}
          <div className="flex items-center gap-1.5 w-full pt-1.5">
            <button
              onPointerDown={() => {
                if (!isPoweredOn) return;
                setLocalBendingDown(true);
                deck?.pitchBend(-0.06);
              }}
              onPointerUp={() => {
                setLocalBendingDown(false);
                deck?.pitchBend(0);
              }}
              onPointerLeave={() => {
                setLocalBendingDown(false);
                deck?.pitchBend(0);
              }}
              onPointerCancel={() => {
                setLocalBendingDown(false);
                deck?.pitchBend(0);
              }}
              className={`flex-1 h-9 sm:h-10 rounded-lg font-mono font-black text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 select-none transition-all touch-none border ${
                !isPoweredOn
                  ? 'border-[#202230] bg-[#0c0d14] text-neutral-600 cursor-default'
                  : 'cursor-pointer active:scale-95 shadow-sm border-[#25283c] hover:border-[#383d58] bg-[#141622] hover:bg-[#1a1d2e] text-neutral-300 hover:text-white'
              }`}
              style={{
                background: !isPoweredOn
                  ? undefined
                  : isBendingDown
                  ? `radial-gradient(circle at 50% 50%, ${accentColor}40 0%, ${accentColor}18 65%, #121422 100%)`
                  : undefined,
                boxShadow: !isPoweredOn
                  ? 'none'
                  : isBendingDown
                  ? `inset 0 0 10px ${accentColor}45, inset 0 1px 1px rgba(255,255,255,0.2)`
                  : undefined,
              }}
              title={isPoweredOn ? `Hold to Pitch Bend - (Slow Down Kick) • Shortcut: Hold ${id === 'A' ? 'F' : 'J'} + -` : 'Deck Off'}
            >
              <span
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  backgroundColor: !isPoweredOn ? '#272938' : isBendingDown ? accentColor : `${accentColor}40`,
                  boxShadow: isPoweredOn && isBendingDown ? `0 0 6px ${accentColor}` : undefined,
                }}
              />
              <span
                className="leading-none text-sm sm:text-base font-black transition-all"
                style={{
                  color: !isPoweredOn ? '#4b5563' : isBendingDown ? '#ffffff' : undefined,
                  textShadow: isPoweredOn && isBendingDown ? `0 0 8px ${accentColor}` : undefined,
                }}
              >
                −
              </span>
            </button>
            <button
              onPointerDown={() => {
                if (!isPoweredOn) return;
                setLocalBendingUp(true);
                deck?.pitchBend(0.06);
              }}
              onPointerUp={() => {
                setLocalBendingUp(false);
                deck?.pitchBend(0);
              }}
              onPointerLeave={() => {
                setLocalBendingUp(false);
                deck?.pitchBend(0);
              }}
              onPointerCancel={() => {
                setLocalBendingUp(false);
                deck?.pitchBend(0);
              }}
              className={`flex-1 h-9 sm:h-10 rounded-lg font-mono font-black text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 select-none transition-all touch-none border ${
                !isPoweredOn
                  ? 'border-[#202230] bg-[#0c0d14] text-neutral-600 cursor-default'
                  : 'cursor-pointer active:scale-95 shadow-sm border-[#25283c] hover:border-[#383d58] bg-[#141622] hover:bg-[#1a1d2e] text-neutral-300 hover:text-white'
              }`}
              style={{
                background: !isPoweredOn
                  ? undefined
                  : isBendingUp
                  ? `radial-gradient(circle at 50% 50%, ${accentColor}40 0%, ${accentColor}18 65%, #121422 100%)`
                  : undefined,
                boxShadow: !isPoweredOn
                  ? 'none'
                  : isBendingUp
                  ? `inset 0 0 10px ${accentColor}45, inset 0 1px 1px rgba(255,255,255,0.2)`
                  : undefined,
              }}
              title={isPoweredOn ? `Hold to Pitch Bend + (Speed Up Kick) • Shortcut: Hold ${id === 'A' ? 'F' : 'J'} + +` : 'Deck Off'}
            >
              <span
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  backgroundColor: !isPoweredOn ? '#272938' : isBendingUp ? accentColor : `${accentColor}40`,
                  boxShadow: isPoweredOn && isBendingUp ? `0 0 6px ${accentColor}` : undefined,
                }}
              />
              <span
                className="leading-none text-sm sm:text-base font-black transition-all"
                style={{
                  color: !isPoweredOn ? '#4b5563' : isBendingUp ? '#ffffff' : undefined,
                  textShadow: isPoweredOn && isBendingUp ? `0 0 8px ${accentColor}` : undefined,
                }}
              >
                +
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Loop & Beat Section */}
      <div className="flex items-center justify-between gap-2.5 rounded-lg bg-[#08090f] px-3 py-2 border border-[#1e202d]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!isPoweredOn) return;
              deck?.toggleLoop();
            }}
            className={`px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-mono font-black transition-all border ${
              !isPoweredOn
                ? 'border-[#202230] bg-[#0c0d14] text-neutral-600 cursor-default'
                : 'border-[#222536] bg-[#141622] hover:bg-[#1c1e2c] text-neutral-300 hover:text-neutral-100 cursor-pointer'
            }`}
            style={{
              background: isPoweredOn && deck?.loopActive
                ? `radial-gradient(circle at 50% 50%, ${accentColor}40 0%, ${accentColor}15 65%, #141622 100%)`
                : undefined,
              boxShadow: isPoweredOn && deck?.loopActive
                ? `inset 0 0 8px ${accentColor}45`
                : undefined,
              color: isPoweredOn && deck?.loopActive ? '#ffffff' : undefined,
              textShadow: isPoweredOn && deck?.loopActive ? `0 0 6px ${accentColor}` : undefined,
            }}
          >
            LOOP {deck?.loopActive ? 'ON' : 'OFF'}
          </button>

          {[1, 2, 4, 8].map((beats, idx) => {
            const isBeatsActive = deck?.loopActive && deck.loopLengthBeats === beats;
            const shortcutNum = idx + 1;
            const shortcutKey = id === 'A' ? `F+${shortcutNum}` : `J+${shortcutNum}`;
            return (
              <button
                key={beats}
                onClick={() => {
                  if (!isPoweredOn) return;
                  deck?.toggleLoop(beats);
                }}
                className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[10px] min-[400px]:text-[11px] sm:text-xs font-mono font-bold transition-colors border ${
                  !isPoweredOn
                    ? 'border-[#202230] bg-[#0c0d14] text-neutral-600 cursor-default'
                    : 'border-[#222536] bg-[#141622] hover:bg-[#1c1e2c] text-neutral-400 hover:text-white cursor-pointer'
                }`}
                style={{
                  background: isPoweredOn && isBeatsActive
                    ? `radial-gradient(circle at 50% 50%, ${accentColor}40 0%, ${accentColor}15 65%, #141622 100%)`
                    : undefined,
                  boxShadow: isPoweredOn && isBeatsActive
                    ? `inset 0 0 8px ${accentColor}45`
                    : undefined,
                  color: isPoweredOn && isBeatsActive ? '#ffffff' : undefined,
                  fontWeight: isBeatsActive ? '900' : undefined,
                  textShadow: isPoweredOn && isBeatsActive ? `0 0 6px ${accentColor}` : undefined,
                }}
                title={isPoweredOn ? `${beats} Beat Loop (${shortcutKey})` : 'Deck Off'}
              >
                {beats}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hot Cues Pads & Main Round Transport (Play/Cue) */}
      <div className="flex items-center justify-between gap-2 sm:gap-3.5 pt-2 border-t border-[#1a1c27]">
        {/* Large Round Transport: CUE & PLAY (Realistic Hardware Bezel + Internal Backlighting) */}
        <div className="flex items-center gap-1.5 min-[400px]:gap-2.5 sm:gap-3 shrink-0">
          {/* CUE Button */}
          <button
            onPointerDown={(e) => {
              if (!isPoweredOn) return;
              e.preventDefault();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch (_) {}

              if (cueHoldTimerRef.current) clearTimeout(cueHoldTimerRef.current);
              isCueHeldRef.current = false;

              // Press & hold threshold: holding >260ms plays the cue
              cueHoldTimerRef.current = setTimeout(() => {
                isCueHeldRef.current = true;
                deck?.playCueDown();
                cueHoldTimerRef.current = null;
              }, 260);
            }}
            onPointerUp={(e) => {
              if (!isPoweredOn) return;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch (_) {}

              if (cueHoldTimerRef.current) {
                // Released before 260ms -> click/tap: PLACES THE CUE!
                clearTimeout(cueHoldTimerRef.current);
                cueHoldTimerRef.current = null;
                deck?.setCue();
              } else if (isCueHeldRef.current || deck?.isCueAuditioning) {
                // Released after hold -> stop playing cue and pause at cue point
                isCueHeldRef.current = false;
                deck?.cueUp();
              }
            }}
            onPointerCancel={(e) => {
              if (!isPoweredOn) return;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch (_) {}

              if (cueHoldTimerRef.current) {
                clearTimeout(cueHoldTimerRef.current);
                cueHoldTimerRef.current = null;
              }
              if (isCueHeldRef.current || deck?.isCueAuditioning) {
                isCueHeldRef.current = false;
                deck?.cueUp();
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!isPoweredOn) return;
              deck?.setCue();
            }}
            className={`w-11 h-11 min-[400px]:w-13 min-[400px]:h-13 sm:w-16 sm:h-16 rounded-full border-2 font-mono font-black text-[11px] min-[400px]:text-xs sm:text-sm flex items-center justify-center select-none touch-none shrink-0 transition-all ${
              isPoweredOn
                ? 'duration-75 delay-[150ms] border-[#2b2d3e] bg-[#14151f] hover:bg-[#1a1b28] shadow-lg active:scale-95 cursor-pointer'
                : 'duration-75 delay-0 border-[#1e202d] bg-[#0c0d14] cursor-default shadow-none'
            }`}
            style={{
              background: !isPoweredOn
                ? '#0c0d14'
                : deck?.hasCue || deck?.isCueAuditioning
                ? 'radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.42) 0%, rgba(245, 158, 11, 0.15) 65%, #14151f 100%)'
                : 'radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.18) 0%, #12131c 100%)',
              boxShadow: !isPoweredOn
                ? 'none'
                : deck?.hasCue || deck?.isCueAuditioning
                ? 'inset 0 0 16px rgba(245, 158, 11, 0.55)'
                : 'inset 0 0 10px rgba(245, 158, 11, 0.25)',
              textShadow: !isPoweredOn
                ? 'none'
                : deck?.hasCue || deck?.isCueAuditioning
                ? '0 0 8px rgba(245, 158, 11, 0.9)'
                : '0 0 5px rgba(245, 158, 11, 0.5)',
              color: !isPoweredOn
                ? '#374151'
                : deck?.hasCue || deck?.isCueAuditioning ? '#fcd34d' : '#f59e0b',
            }}
            title={isPoweredOn ? 'CUE: Press to place cue · Press & hold to play cue' : 'Deck Off'}
          >
            CUE
          </button>

          {/* PLAY / PAUSE Button */}
          <button
            onClick={() => {
              if (!isPoweredOn) return;
              deck?.togglePlay();
            }}
            className={`w-11 h-11 min-[400px]:w-13 min-[400px]:h-13 sm:w-16 sm:h-16 rounded-full border-2 flex items-center justify-center font-mono font-black text-[11px] min-[400px]:text-xs sm:text-sm shrink-0 transition-all ${
              isPoweredOn
                ? 'duration-75 delay-[250ms] border-[#2b2d3e] shadow-lg active:scale-95 cursor-pointer'
                : 'duration-75 delay-0 border-[#1e202d] bg-[#0c0d14] cursor-default shadow-none'
            }`}
            style={{
              background: !isPoweredOn
                ? '#0c0d14'
                : isPlaying
                ? 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.45) 0%, rgba(16, 185, 129, 0.15) 65%, #0e1d16 100%)'
                : 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.12) 0%, #0d1411 100%)',
              boxShadow: !isPoweredOn
                ? 'none'
                : isPlaying
                ? 'inset 0 0 14px rgba(16, 185, 129, 0.5)'
                : 'inset 0 0 8px rgba(16, 185, 129, 0.2)',
              color: !isPoweredOn ? '#374151' : isPlaying ? '#ffffff' : '#34d399',
              filter: isPoweredOn && isPlaying ? 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))' : 'none',
            }}
            title={!isPoweredOn ? 'Deck Off' : isPlaying ? `Pause [${id === 'A' ? 'F' : 'J'}]` : `Play [${id === 'A' ? 'F' : 'J'}]`}
          >
            {isPlaying ? <Pause className="w-4.5 h-4.5 min-[400px]:w-5.5 min-[400px]:h-5.5 sm:w-6.5 sm:h-6.5 fill-current" /> : <Play className="w-4.5 h-4.5 min-[400px]:w-5.5 min-[400px]:h-5.5 sm:w-6.5 sm:h-6.5 fill-current ml-0.5" />}
          </button>
        </div>

        {/* 4 Performance Hot Cue Pads (Hardware Rubber Pads with Internal LED Backlighting) */}
        <div className="flex items-center gap-1 min-[400px]:gap-1.5 sm:gap-2 shrink-0">
          {deck?.hotCues.map((cue, idx) => {
            const addKey = id === 'A' ? `T+${cue.id}` : `U+${cue.id}`;
            const playKey = id === 'A' ? `V+${cue.id}` : `N+${cue.id}`;
            const cueDelay = 350 + idx * 70;
            return (
              <button
                key={cue.id}
                onClick={() => {
                  if (!isPoweredOn) return;
                  deck.triggerHotCue(cue.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isPoweredOn) return;
                  deck.clearHotCue(cue.id);
                }}
                className={`w-8 h-8 min-[380px]:w-9 min-[380px]:h-9 min-[420px]:w-10 min-[420px]:h-10 sm:w-12 sm:h-12 rounded-lg border-2 flex flex-col items-center justify-center font-mono text-[10px] min-[400px]:text-xs sm:text-sm font-black select-none transition-all shrink-0 ${
                  isPoweredOn
                    ? 'duration-75 border-[#252838] bg-[#151620] text-neutral-400 hover:border-neutral-500 active:scale-95 cursor-pointer'
                    : 'duration-75 border-[#1e202d] bg-[#0c0d14] text-neutral-600 cursor-default'
                }`}
                style={{
                  transitionDelay: isPoweredOn ? `${cueDelay}ms` : '0ms',
                  background: isPoweredOn && cue.active
                    ? `radial-gradient(circle at 50% 50%, ${cue.color}45 0%, ${cue.color}15 65%, #151624 100%)`
                    : undefined,
                  boxShadow: isPoweredOn && cue.active
                    ? `inset 0 0 10px ${cue.color}50`
                    : undefined,
                  color: !isPoweredOn ? '#374151' : cue.active ? '#ffffff' : undefined,
                  textShadow: isPoweredOn && cue.active ? `0 0 6px ${cue.color}` : undefined,
                }}
                title={
                  !isPoweredOn
                    ? 'Deck Off'
                    : cue.active
                    ? `Hot Cue ${cue.id} [Play: ${playKey} · Overwrite: ${addKey} · Right click: Clear]`
                    : `Set Hot Cue ${cue.id} [${addKey}]`
                }
              >
                <span>C{cue.id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
