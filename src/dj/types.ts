export interface TrackMetadata {
  title: string;
  artist: string;
  duration: number; // seconds
  bpm: number;
  firstBeatOffset?: number; // seconds to first kick / downbeat
  key?: string;
  artworkUrl?: string;
}

export interface HotCue {
  id: number;
  time: number; // seconds
  active: boolean;
  color: string;
}

export interface DeckState {
  isPlaying: boolean;
  isCueing: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  tempoMultiplier: number; // 0.84 to 1.16 (-16% to +16%)
  loopActive: boolean;
  loopStart: number;
  loopEnd: number;
  loopLengthBeats: number;
  hotCues: HotCue[];
  gain: number; // 0 to 1
  eqHigh: number; // -24 to +6 dB
  eqMid: number;  // -24 to +6 dB
  eqLow: number;  // -24 to +6 dB
  filter: number; // -1 (full LP) to +1 (full HP), 0 = off
  volume: number; // 0 to 1 (channel fader)
  track: TrackMetadata | null;
  vuLevel: number; // 0 to 1
}

export type CrossfaderCurve = 'linear' | 'cut' | 'smooth';
