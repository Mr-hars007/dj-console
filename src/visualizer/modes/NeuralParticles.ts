import * as THREE from 'three';
import type { VisualizerTheme } from '../../audio/types';


export class NeuralParticles {
  public group: THREE.Group;
  private particleCount = 2400;
  private particlesMesh: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private originalPositions: Float32Array;
  private velocities: Float32Array;
  private colors: Float32Array;

  // Synaptic Lines between close particles
  private linesMesh: THREE.LineSegments;
  private lineGeometry: THREE.BufferGeometry;
  private linePositions: Float32Array;
  private maxLineConnections = 300;

  constructor(theme: VisualizerTheme) {
    this.group = new THREE.Group();

    // Setup Particle Points
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.particleCount * 3);
    this.originalPositions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    this.colors = new Float32Array(this.particleCount * 3);

    const color1 = new THREE.Color(theme.primary);
    const color2 = new THREE.Color(theme.secondary);

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      // Spherical distribution
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 28 + 4;

      const sinPhi = Math.sin(phi);
      const x = r * sinPhi * Math.cos(theta);
      const y = r * sinPhi * Math.sin(theta);
      const z = r * Math.cos(phi);

      this.positions[i3] = x;
      this.positions[i3 + 1] = y;
      this.positions[i3 + 2] = z;

      this.originalPositions[i3] = x;
      this.originalPositions[i3 + 1] = y;
      this.originalPositions[i3 + 2] = z;

      this.velocities[i3] = (Math.random() - 0.5) * 0.04;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.04;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.04;

      // Color gradient
      const lerpFactor = Math.random();
      const pColor = color1.clone().lerp(color2, lerpFactor);
      this.colors[i3] = pColor.r;
      this.colors[i3 + 1] = pColor.g;
      this.colors[i3 + 2] = pColor.b;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlesMesh = new THREE.Points(this.geometry, particleMaterial);
    this.group.add(this.particlesMesh);

    // Setup Synaptic Connection Lines
    this.lineGeometry = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(this.maxLineConnections * 6);
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(theme.primary),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.linesMesh = new THREE.LineSegments(this.lineGeometry, lineMaterial);
    this.group.add(this.linesMesh);
  }

  public update(time: number, bass: number, mid: number, treble: number) {
    const bassFactor = bass * 1.8;
    const midFactor = mid * 1.2;
    const trebleFactor = treble * 2.0;

    const pos = this.positions;
    const orig = this.originalPositions;
    const vel = this.velocities;

    let lineIndex = 0;
    const checkSubset = 120; // Check subset for fast 60fps synaptic ray calculation

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      // Pulse outward on bass
      const dist = Math.sqrt(orig[i3] ** 2 + orig[i3 + 1] ** 2 + orig[i3 + 2] ** 2);
      const push = 1.0 + (bassFactor * 0.35 * Math.sin(time * 3 + dist * 0.2));

      pos[i3] = orig[i3] * push + Math.sin(time + orig[i3 + 1] * 0.1) * midFactor * 2;
      pos[i3 + 1] = orig[i3 + 1] * push + Math.cos(time + orig[i3] * 0.1) * midFactor * 2;
      pos[i3 + 2] = orig[i3 + 2] * push + Math.sin(time * 1.5 + orig[i3 + 2] * 0.1) * trebleFactor * 1.5;

      // Drift
      orig[i3] += vel[i3];
      orig[i3 + 1] += vel[i3 + 1];
      orig[i3 + 2] += vel[i3 + 2];

      // Bounce bounds
      if (Math.abs(orig[i3]) > 32) vel[i3] *= -1;
      if (Math.abs(orig[i3 + 1]) > 32) vel[i3 + 1] *= -1;
      if (Math.abs(orig[i3 + 2]) > 32) vel[i3 + 2] *= -1;

      // Compute synaptic rays on loud transients
      if (i < checkSubset && (bass > 0.35 || mid > 0.4) && lineIndex < this.maxLineConnections * 6) {
        for (let j = i + 1; j < checkSubset; j++) {
          const j3 = j * 3;
          const dx = pos[i3] - pos[j3];
          const dy = pos[i3 + 1] - pos[j3 + 1];
          const dz = pos[i3 + 2] - pos[j3 + 2];
          const d2 = dx * dx + dy * dy + dz * dz;

          if (d2 < 64 && lineIndex < this.maxLineConnections * 6) {
            this.linePositions[lineIndex++] = pos[i3];
            this.linePositions[lineIndex++] = pos[i3 + 1];
            this.linePositions[lineIndex++] = pos[i3 + 2];
            this.linePositions[lineIndex++] = pos[j3];
            this.linePositions[lineIndex++] = pos[j3 + 1];
            this.linePositions[lineIndex++] = pos[j3 + 2];
          }
        }
      }
    }

    // Zero out unused line segments
    while (lineIndex < this.maxLineConnections * 6) {
      this.linePositions[lineIndex++] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.lineGeometry.attributes.position.needsUpdate = true;

    // Slowly rotate group
    this.group.rotation.y = time * 0.12 + mid * 0.5;
    this.group.rotation.x = Math.sin(time * 0.08) * 0.2;
  }

  public updateTheme(theme: VisualizerTheme) {
    const color1 = new THREE.Color(theme.primary);
    const color2 = new THREE.Color(theme.secondary);

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      const lerpFactor = Math.random();
      const pColor = color1.clone().lerp(color2, lerpFactor);
      this.colors[i3] = pColor.r;
      this.colors[i3 + 1] = pColor.g;
      this.colors[i3 + 2] = pColor.b;
    }
    this.geometry.attributes.color.needsUpdate = true;
    (this.linesMesh.material as THREE.LineBasicMaterial).color.set(theme.primary);
  }

  public dispose() {
    this.geometry.dispose();
    this.lineGeometry.dispose();
    (this.particlesMesh.material as THREE.Material).dispose();
    (this.linesMesh.material as THREE.Material).dispose();
  }
}
