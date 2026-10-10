/**
 * Pro DJ DSP BPM and Beatgrid Alignment Engine.
 * Features:
 * 1. 180Hz Lowpass transient filtering to isolate kick drum fundamentals and reject cymbals/vocals.
 * 2. Exact envelope clocking (sampleRate / windowSize) with zero clock skew.
 * 3. Multi-window analysis (early section + high-energy 25% drop section) for tracks with atmospheric intros.
 * 4. Picket-fence resistant quadratic peak autocorrelation.
 * 5. Sample-accurate downbeat phase detection aligned to waveform kick apexes.
 */

export interface BeatGridResult {
  bpm: number;
  firstBeatOffset: number; // in seconds
}

export function detectBPMAndBeatGrid(
  buffer: AudioBuffer,
  hintBpm?: number
): BeatGridResult {
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;

  if (duration < 1.0) {
    return { bpm: hintBpm || 120, firstBeatOffset: 0 };
  }

  const numChannels = buffer.numberOfChannels;
  const channelData0 = buffer.getChannelData(0);
  const channelData1 = numChannels > 1 ? buffer.getChannelData(1) : null;

  // 1. Choose analysis segment:
  // If track is > 30s, analyze from ~20% into the song (where the drop/kicks are in full effect)
  // as well as the intro for phase alignment.
  const dropStartSec = duration > 35 ? Math.min(duration * 0.2, 45.0) : 0;
  const analyzeDuration = Math.min(duration - dropStartSec, 60.0);
  const startSample = Math.floor(dropStartSec * sampleRate);
  const totalAnalyzeSamples = Math.floor(analyzeDuration * sampleRate);

  // 2. Exact Envelope Timing: windowSize = 100 samples (~441Hz at 44.1kHz, ~480Hz at 48kHz)
  const windowSize = Math.max(1, Math.round(sampleRate / 400));
  const actualEnvRate = sampleRate / windowSize; // Exact clock rate, zero fractional skew!
  const envLen = Math.floor(totalAnalyzeSamples / windowSize);
  const env = new Float32Array(envLen);

  // 3. 180Hz Lowpass filter to isolate kick drum fundamentals
  const cutoff = 180;
  const rc = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);

  let filtered = 0;
  for (let i = 0; i < envLen; i++) {
    const sStart = startSample + i * windowSize;
    let maxAmp = 0;
    for (let j = 0; j < windowSize; j++) {
      const idx = sStart + j;
      if (idx < buffer.length) {
        let s = channelData0[idx];
        if (channelData1) {
          s = 0.5 * (s + channelData1[idx]);
        }
        filtered += alpha * (s - filtered);
        const absVal = Math.abs(filtered);
        if (absVal > maxAmp) maxAmp = absVal;
      }
    }
    env[i] = maxAmp;
  }

  // 4. Half-wave rectified difference (onset novelty function)
  const onset = new Float32Array(envLen);
  let maxOnset = 0;
  for (let i = 2; i < envLen - 2; i++) {
    const diff = env[i] - env[i - 1];
    if (diff > 0.002) {
      onset[i] = diff;
      if (diff > maxOnset) maxOnset = diff;
    }
  }

  // Peak-preserving quadratic interpolator (eliminates picket-fence discretization skew)
  const getPeakOnset = (exactIdx: number): number => {
    const base = Math.round(exactIdx);
    if (base < 1 || base >= envLen - 1) return 0;
    const v0 = onset[base - 1];
    const v1 = onset[base];
    const v2 = onset[base + 1];
    const d = exactIdx - base; // delta in [-0.5, 0.5]
    return Math.max(0, v1 + 0.5 * d * (v2 - v0) + 0.5 * d * d * (v2 - 2 * v1 + v0));
  };

  const evalScore = (b: number): number => {
    const interval = (60 / b) * actualEnvRate;
    let score = 0;
    const limit = Math.min(envLen - Math.ceil(interval * 4), 7000);
    for (let i = 0; i < limit; i += 2) {
      const o = onset[i];
      if (o > 0.003) {
        score += o * (
          getPeakOnset(i + interval) +
          0.65 * getPeakOnset(i + interval * 2) +
          0.35 * getPeakOnset(i + interval * 3) +
          0.20 * getPeakOnset(i + interval * 4)
        );
      }
    }
    return score;
  };

  // 5. Two-stage Tempo Search
  let bestBpm = hintBpm && hintBpm >= 60 && hintBpm <= 190 ? hintBpm : 124;

  if (maxOnset > 0.005) {
    const searchMin = hintBpm ? Math.max(65, hintBpm - 3) : 70;
    const searchMax = hintBpm ? Math.min(185, hintBpm + 3) : 180;
    const searchStep = hintBpm ? 0.2 : 0.5;

    let coarseBestScore = -1;
    let coarseBestBpm = bestBpm;

    for (let b = searchMin; b <= searchMax; b += searchStep) {
      let score = evalScore(b);
      // Gaussian prior centered at 125 BPM
      const prior = Math.exp(-Math.pow((b - 125) / 85, 2));
      score *= (0.75 + 0.25 * prior);

      if (score > coarseBestScore) {
        coarseBestScore = score;
        coarseBestBpm = b;
      }
    }

    // Octave validation (check half or double tempo harmonic peaks)
    if (!hintBpm) {
      if (coarseBestBpm < 85) {
        const doubleScore = evalScore(coarseBestBpm * 2);
        if (doubleScore > coarseBestScore * 0.82) {
          coarseBestBpm *= 2;
        }
      } else if (coarseBestBpm > 165) {
        const halfScore = evalScore(coarseBestBpm / 2);
        if (halfScore > coarseBestScore * 1.08) {
          coarseBestBpm /= 2;
        }
      }
    }

    // High-resolution fine tuning (+- 1.5 BPM in 0.05 increments)
    let fineBestScore = -1;
    let fineBestBpm = coarseBestBpm;

    for (let b = coarseBestBpm - 1.5; b <= coarseBestBpm + 1.5; b += 0.05) {
      const score = evalScore(b);
      if (score > fineBestScore) {
        fineBestScore = score;
        fineBestBpm = b;
      }
    }

    // Intelligent studio DAW snapping (if within 0.18 BPM of an integer or .5)
    const nearestInt = Math.round(fineBestBpm);
    const intScore = evalScore(nearestInt);
    if (intScore >= fineBestScore * 0.94 && Math.abs(fineBestBpm - nearestInt) < 0.25) {
      bestBpm = nearestInt;
    } else {
      const nearestHalf = Math.round(fineBestBpm * 2) / 2;
      const halfScore = evalScore(nearestHalf);
      if (halfScore >= fineBestScore * 0.96 && Math.abs(fineBestBpm - nearestHalf) < 0.15) {
        bestBpm = nearestHalf;
      } else {
        bestBpm = Math.round(fineBestBpm * 10) / 10;
      }
    }
  }

  // 6. Downbeat / First Beat Phase Offset Detection
  const secondsPerBeat = 60 / bestBpm;
  const beatPeriodFrames = secondsPerBeat * actualEnvRate;

  // To find the downbeat phase, scan onset envelope near the start of the audio
  // Build onset envelope for initial 25 seconds if we started at the drop
  let phaseOnset = onset;
  let phaseEnvLen = envLen;

  if (startSample > 0) {
    const introSamples = Math.min(buffer.length, Math.floor(25.0 * sampleRate));
    const introEnvLen = Math.floor(introSamples / windowSize);
    const introEnv = new Float32Array(introEnvLen);
    let fIntro = 0;
    for (let i = 0; i < introEnvLen; i++) {
      const sStart = i * windowSize;
      let maxAmp = 0;
      for (let j = 0; j < windowSize; j++) {
        const idx = sStart + j;
        if (idx < buffer.length) {
          let s = channelData0[idx];
          if (channelData1) s = 0.5 * (s + channelData1[idx]);
          fIntro += alpha * (s - fIntro);
          const absVal = Math.abs(fIntro);
          if (absVal > maxAmp) maxAmp = absVal;
        }
      }
      introEnv[i] = maxAmp;
    }
    const introOnset = new Float32Array(introEnvLen);
    for (let i = 2; i < introEnvLen - 2; i++) {
      const diff = introEnv[i] - introEnv[i - 1];
      if (diff > 0.002) introOnset[i] = diff;
    }
    phaseOnset = introOnset;
    phaseEnvLen = introEnvLen;
  }

  let bestPhaseScore = -1;
  let bestOffsetFrames = 0;
  const phaseSearchFrames = Math.min(phaseEnvLen, Math.floor(18.0 * actualEnvRate));

  for (let off = 0; off < beatPeriodFrames; off += 0.25) {
    let s = 0;
    for (let k = off; k < phaseSearchFrames; k += beatPeriodFrames) {
      const base = Math.round(k);
      if (base >= 0 && base < phaseEnvLen) {
        s += phaseOnset[base];
      }
    }
    if (s > bestPhaseScore) {
      bestPhaseScore = s;
      bestOffsetFrames = off;
    }
  }

  let coarsePhaseSec = (bestOffsetFrames / actualEnvRate) % secondsPerBeat;
  while (coarsePhaseSec < 0) coarsePhaseSec += secondsPerBeat;

  // 7. Micro-tune Phase to Exact Waveform Peak Apex
  // Scan for the first prominent kick drum peak matching the phase in raw audio
  const searchLimitSamples = Math.min(buffer.length, Math.floor(12.0 * sampleRate));
  const searchRadiusSamples = Math.floor(0.035 * sampleRate);

  // Compute peak reference in early audio
  let earlyPeak = 0.01;
  for (let s = 0; s < Math.min(buffer.length, Math.floor(6.0 * sampleRate)); s += 16) {
    const v = Math.abs(channelData0[s]);
    if (v > earlyPeak) earlyPeak = v;
  }

  let finalBeatOffset = coarsePhaseSec;

  for (let t = coarsePhaseSec; t < 10.0; t += secondsPerBeat) {
    const centerSample = Math.floor(t * sampleRate);
    if (centerSample >= searchLimitSamples) break;

    let localMax = 0;
    let localMaxSample = centerSample;
    const startWin = Math.max(0, centerSample - searchRadiusSamples);
    const endWin = Math.min(buffer.length, centerSample + searchRadiusSamples);

    for (let s = startWin; s < endWin; s++) {
      const v = Math.abs(channelData0[s]);
      if (v > localMax) {
        localMax = v;
        localMaxSample = s;
      }
    }

    // If local peak is at least 25% of early audio energy, this is an audible kick drum!
    if (localMax >= earlyPeak * 0.25) {
      finalBeatOffset = (localMaxSample / sampleRate) % secondsPerBeat;
      break;
    }
  }

  return {
    bpm: Number(bestBpm.toFixed(1)),
    firstBeatOffset: Number(finalBeatOffset.toFixed(4)),
  };
}
