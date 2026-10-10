import * as THREE from 'three';
import type { VisualizerTheme } from '../../audio/types';


export class WaveTerrain {
  public group: THREE.Group;
  private terrainMesh: THREE.Mesh;
  private geometry: THREE.PlaneGeometry;
  private width = 80;
  private depth = 80;
  private segments = 48;

  constructor(theme: VisualizerTheme) {
    this.group = new THREE.Group();

    this.geometry = new THREE.PlaneGeometry(this.width, this.depth, this.segments, this.segments);
    this.geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.primary),
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });

    this.terrainMesh = new THREE.Mesh(this.geometry, material);
    this.terrainMesh.position.y = -8;
    this.group.add(this.terrainMesh);

    // Add a glowing horizon sun/ring in the distance
    const sunGeo = new THREE.RingGeometry(8, 11, 48);
    const sunMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.secondary),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(0, 4, -40);
    this.group.add(sunMesh);
  }

  public update(time: number, bass: number, mid: number, treble: number, timeDomain?: Uint8Array) {
    const pos = this.geometry.attributes.position;
    const count = pos.count;
    const speed = time * 3;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const wave = Math.sin((z + speed) * 0.3) * (2.5 + bass * 4.5);

      const crossWave = Math.cos(x * 0.4 + time * 2) * (1.5 + mid * 3.0);

      // Audio waveform bump if available
      let audioBump = 0;
      if (timeDomain && timeDomain.length > 0) {
        const sampleIdx = Math.floor((Math.abs(x) / (this.width / 2)) * (timeDomain.length - 1));
        const sampleVal = (timeDomain[sampleIdx] - 128) / 128;
        audioBump = sampleVal * (3.0 + treble * 5.0);
      }

      const y = wave + crossWave + audioBump;
      pos.setY(i, y);
    }

    pos.needsUpdate = true;
  }

  public updateTheme(theme: VisualizerTheme) {
    (this.terrainMesh.material as THREE.MeshBasicMaterial).color.set(theme.primary);
  }

  public dispose() {
    this.geometry.dispose();
    (this.terrainMesh.material as THREE.Material).dispose();
  }
}
