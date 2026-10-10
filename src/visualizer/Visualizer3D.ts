import * as THREE from 'three';
import type { VisualizerMode, VisualizerTheme } from '../audio/types';

import { VISUALIZER_THEMES } from './themes';
import { NeuralParticles } from './modes/NeuralParticles';
import { CyberCore } from './modes/CyberCore';
import { WaveTerrain } from './modes/WaveTerrain';

export class Visualizer3D {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animationFrameId: number | null = null;

  // Analyser node reference
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array = new Uint8Array(512);
  private timeData: Uint8Array = new Uint8Array(512);

  // Modes
  private currentMode: VisualizerMode = 'neural';
  private neuralMode: NeuralParticles;
  private cyberCoreMode: CyberCore;
  private waveTerrainMode: WaveTerrain;

  // Current Theme
  private currentTheme: VisualizerTheme;

  // Camera Orbit Interaction
  private isDragging = false;
  private prevMouseX = 0;
  private prevMouseY = 0;
  private cameraRotationY = 0;
  private cameraRotationX = 0;
  private targetDist = 42;
  private currentDist = 42;

  // Smoothed Audio Energy Bands
  private bass = 0;
  private mid = 0;
  private treble = 0;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, analyser: AnalyserNode | null) {
    this.container = container;
    this.canvas = canvas;
    this.analyser = analyser;
    this.currentTheme = VISUALIZER_THEMES[0];

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.currentTheme.background);
    this.scene.fog = new THREE.FogExp2(this.currentTheme.background, 0.015);

    // 2. Camera
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.updateCameraPosition();

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. Initialize Modes
    this.neuralMode = new NeuralParticles(this.currentTheme);
    this.cyberCoreMode = new CyberCore(this.currentTheme);
    this.waveTerrainMode = new WaveTerrain(this.currentTheme);

    this.scene.add(this.neuralMode.group);
    this.cyberCoreMode.group.visible = false;
    this.waveTerrainMode.group.visible = false;
    this.scene.add(this.cyberCoreMode.group);
    this.scene.add(this.waveTerrainMode.group);

    // 5. Setup Event Listeners
    this.setupInteractions();
    this.handleResize();

    // 6. Start Loop
    this.animate = this.animate.bind(this);
    this.animate();
  }

  public setAnalyser(analyser: AnalyserNode) {
    this.analyser = analyser;
    if (analyser) {
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
      this.timeData = new Uint8Array(analyser.frequencyBinCount);
    }
  }

  public setMode(mode: VisualizerMode) {
    this.currentMode = mode;
    this.neuralMode.group.visible = mode === 'neural';
    this.cyberCoreMode.group.visible = mode === 'cybercore';
    this.waveTerrainMode.group.visible = mode === 'terrain';

    if (mode === 'terrain') {
      this.targetDist = 35;
      this.cameraRotationX = 0.2;
    } else {
      this.targetDist = 42;
    }
  }

  public setTheme(themeId: string) {
    const theme = VISUALIZER_THEMES.find((t) => t.id === themeId) || VISUALIZER_THEMES[0];
    this.currentTheme = theme;
    this.scene.background = new THREE.Color(theme.background);
    if (this.scene.fog) {
      this.scene.fog.color = new THREE.Color(theme.background);
    }

    this.neuralMode.updateTheme(theme);
    this.cyberCoreMode.updateTheme(theme);
    this.waveTerrainMode.updateTheme(theme);
  }

  private setupInteractions() {
    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouseX;
      const dy = e.clientY - this.prevMouseY;

      this.cameraRotationY -= dx * 0.005;
      this.cameraRotationX = Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4, this.cameraRotationX + dy * 0.005));

      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      this.targetDist = Math.max(15, Math.min(85, this.targetDist + e.deltaY * 0.04));
    };

    this.canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    this.canvas.addEventListener('wheel', onWheel, { passive: true });
  }

  private updateCameraPosition() {
    this.currentDist += (this.targetDist - this.currentDist) * 0.1;
    const cosX = Math.cos(this.cameraRotationX);
    const x = this.currentDist * Math.sin(this.cameraRotationY) * cosX;
    const y = this.currentDist * Math.sin(this.cameraRotationX);
    const z = this.currentDist * Math.cos(this.cameraRotationY) * cosX;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  public handleResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private sampleAudioEnergies() {
    if (!this.analyser) {
      this.bass *= 0.9;
      this.mid *= 0.9;
      this.treble *= 0.9;
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData as any);
    this.analyser.getByteTimeDomainData(this.timeData as any);

    // Bass: bins 1 to 10 (~20 - 200 Hz)
    let rawBass = 0;
    for (let i = 1; i <= 10; i++) rawBass += this.freqData[i];
    rawBass /= 10 * 255;

    // Mid: bins 11 to 70 (~200 - 1500 Hz)
    let rawMid = 0;
    for (let i = 11; i <= 70; i++) rawMid += this.freqData[i];
    rawMid /= 60 * 255;

    // Treble: bins 71 to 240 (~1500 - 5500 Hz)
    let rawTreble = 0;
    for (let i = 71; i <= 240; i++) rawTreble += this.freqData[i];
    rawTreble /= 170 * 255;

    // Smooth envelope attack / release
    this.bass += (rawBass - this.bass) * 0.35;
    this.mid += (rawMid - this.mid) * 0.25;
    this.treble += (rawTreble - this.treble) * 0.25;
  }

  private animate() {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const time = performance.now() * 0.001;

    this.sampleAudioEnergies();
    this.updateCameraPosition();

    // Auto subtle drift when not dragging
    if (!this.isDragging) {
      this.cameraRotationY += 0.001 + this.bass * 0.002;
    }

    if (this.currentMode === 'neural') {
      this.neuralMode.update(time, this.bass, this.mid, this.treble);
    } else if (this.currentMode === 'cybercore') {
      this.cyberCoreMode.update(time, this.bass, this.mid, this.treble, this.freqData);
    } else if (this.currentMode === 'terrain') {
      this.waveTerrainMode.update(time, this.bass, this.mid, this.treble, this.timeData);
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.neuralMode.dispose();
    this.cyberCoreMode.dispose();
    this.waveTerrainMode.dispose();
    this.renderer.dispose();
  }
}
