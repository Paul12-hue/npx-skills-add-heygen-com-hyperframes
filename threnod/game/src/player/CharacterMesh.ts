import * as THREE from 'three';

export interface CharacterColors {
  cloak: string;
  body: string;
  skin: string;
  legs: string;
  hood: boolean;
}

export const UNSUNG_COLORS: CharacterColors = { cloak: '6a6a8a', body: '4a4660', skin: 'd8b090', legs: '2a2838', hood: true };

const mat = (hex: string) => new THREE.MeshPhongMaterial({ color: '#' + hex, shininess: 40, specular: 0x3a2a5a });

/**
 * A low-poly humanoid built from primitives, with a simple procedural walk cycle.
 * Placeholder until real models exist – kept deliberately chunky (PS1/PS2 style).
 */
export class CharacterMesh {
  readonly root = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private body: THREE.Group;
  private phase = 0;

  constructor(colors: CharacterColors, scale = 1) {
    this.body = new THREE.Group();
    this.root.add(this.body);

    const legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.22);
    legGeo.translate(0, -0.4, 0);
    this.legL = new THREE.Mesh(legGeo, mat(colors.legs));
    this.legR = new THREE.Mesh(legGeo, mat(colors.legs));
    this.legL.position.set(-0.13, 0.82, 0);
    this.legR.position.set(0.13, 0.82, 0);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.75, 6), mat(colors.body));
    torso.position.y = 1.18;
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.25, 7, 1, true), mat(colors.cloak));
    (cloak.material as THREE.MeshPhongMaterial).side = THREE.DoubleSide;
    cloak.position.set(0, 1.0, 0.04); // the cloak hangs at the back (+z); the figure faces −z

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(colors.skin));
    head.position.y = 1.72;
    this.body.add(torso, cloak, head);
    if (colors.hood) {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.5, 6), mat(colors.cloak));
      hood.position.set(0, 1.82, 0.04);
      this.body.add(hood);
    }

    const armGeo = new THREE.BoxGeometry(0.14, 0.62, 0.14);
    armGeo.translate(0, -0.3, 0);
    this.armL = new THREE.Mesh(armGeo, mat(colors.cloak));
    this.armR = new THREE.Mesh(armGeo, mat(colors.cloak));
    this.armL.position.set(-0.33, 1.5, 0);
    this.armR.position.set(0.33, 1.5, 0);

    this.root.add(this.legL, this.legR, this.armL, this.armR);

    // cheap blob shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 10),
      new THREE.MeshBasicMaterial({ color: 0x120a05, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    this.root.add(shadow);

    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== shadow) o.castShadow = true;
    });
    this.root.scale.setScalar(scale);
  }

  /** speed01: 0 = idle, 1 = walking, ~1.7 = running. */
  animate(dt: number, speed01: number, t: number): void {
    if (speed01 > 0.05) {
      this.phase += dt * (5 + speed01 * 4);
      const swing = Math.sin(this.phase) * 0.55 * Math.min(1.2, speed01);
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.7;
      this.armR.rotation.x = swing * 0.7;
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * speed01;
    } else {
      const ease = Math.min(1, dt * 8);
      for (const p of [this.legL, this.legR, this.armL, this.armR]) p.rotation.x -= p.rotation.x * ease;
      this.body.position.y = Math.sin(t * 1.6) * 0.012; // breathing
    }
  }
}
