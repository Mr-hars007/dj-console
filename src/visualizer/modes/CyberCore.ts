import * as THREE from 'three';
import type { VisualizerTheme } from '../../audio/types';


export class CyberCore {
  public group: THREE.Group;
  private coreMesh: THREE.Mesh;
  private wireMesh: THREE.Mesh;
  private ring1: THREE.Mesh;
  private ring2: THREE.Mesh;
  private ring3: THREE.Mesh;

  private coreGeometry: THREE.IcosahedronGeometry;
  private originalPositions: Float32Array;

  constructor(theme: VisualizerTheme) {
    this.group = new THREE.Group();

    // 1. Central Core Geometry
    this.coreGeometry = new THREE.IcosahedronGeometry(7, 3);
    const posAttr = this.coreGeometry.attributes.position;
    this.originalPositions = new Float32Array(posAttr.array);

    // Inner Glowing Solid Mesh
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.secondary),
      wireframe: false,
      transparent: true,
      opacity: 0.25,
    });
    this.coreMesh = new THREE.Mesh(this.coreGeometry, coreMat);
    this.group.add(this.coreMesh);

    // Outer Wireframe Mesh
    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.primary),
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    this.wireMesh = new THREE.Mesh(this.coreGeometry, wireMat);
    this.group.add(this.wireMesh);

    // 2. Orbiting Holographic Rings
    const ringGeo1 = new THREE.TorusGeometry(12, 0.12, 16, 80);
    const ringGeo2 = new THREE.TorusGeometry(15, 0.1, 16, 80);
    const ringGeo3 = new THREE.TorusGeometry(18, 0.08, 16, 80);

    const ringMat1 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.primary),
      wireframe: true,
      transparent: true,
      opacity: 0.7,
    });
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.accent),
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    const ringMat3 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.secondary),
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });

    this.ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    this.ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    this.ring3 = new THREE.Mesh(ringGeo3, ringMat3);

    this.ring1.rotation.x = Math.PI * 0.4;
    this.ring2.rotation.y = Math.PI * 0.35;
    this.ring3.rotation.z = Math.PI * 0.25;

    this.group.add(this.ring1);
    this.group.add(this.ring2);
    this.group.add(this.ring3);
  }

  public update(time: number, bass: number, mid: number, treble: number, freqData?: Uint8Array) {
    // Dynamic vertex displacement on the core
    const posAttr = this.coreGeometry.attributes.position;
    const pos = posAttr.array as Float32Array;
    const orig = this.originalPositions;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const ox = orig[i3];
      const oy = orig[i3 + 1];
      const oz = orig[i3 + 2];

      const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
      const nx = ox / len;
      const ny = oy / len;
      const nz = oz / len;

      // Sample frequency if available
      const freqSample = freqData ? (freqData[i % freqData.length] / 255) : mid;

      const displacement =
        Math.sin(time * 4 + ox * 0.5) * (bass * 3.5) +
        Math.cos(time * 3 + oy * 0.5) * (freqSample * 2.5) +
        Math.sin(time * 5 + oz * 0.5) * (treble * 1.8);

      const r = len + displacement;
      pos[i3] = nx * r;
      pos[i3 + 1] = ny * r;
      pos[i3 + 2] = nz * r;
    }

    posAttr.needsUpdate = true;

    // Pulse scale with master bass
    const scale = 1.0 + bass * 0.4;
    this.coreMesh.scale.set(scale, scale, scale);
    this.wireMesh.scale.set(scale, scale, scale);

    // Rotate core
    this.coreMesh.rotation.y = time * 0.3;
    this.coreMesh.rotation.x = time * 0.15;
    this.wireMesh.rotation.y = time * 0.3;
    this.wireMesh.rotation.x = time * 0.15;

    // Spin rings
    this.ring1.rotation.z = time * (0.8 + treble * 1.5);
    this.ring2.rotation.x = time * (0.6 + bass * 1.2);
    this.ring3.rotation.y = time * (0.4 + mid * 1.0);

    const ringScale = 1.0 + bass * 0.2;
    this.ring1.scale.set(ringScale, ringScale, ringScale);
  }

  public updateTheme(theme: VisualizerTheme) {
    (this.coreMesh.material as THREE.MeshBasicMaterial).color.set(theme.secondary);
    (this.wireMesh.material as THREE.MeshBasicMaterial).color.set(theme.primary);
    (this.ring1.material as THREE.MeshBasicMaterial).color.set(theme.primary);
    (this.ring2.material as THREE.MeshBasicMaterial).color.set(theme.accent);
    (this.ring3.material as THREE.MeshBasicMaterial).color.set(theme.secondary);
  }

  public dispose() {
    this.coreGeometry.dispose();
    this.ring1.geometry.dispose();
    this.ring2.geometry.dispose();
    this.ring3.geometry.dispose();
  }
}
