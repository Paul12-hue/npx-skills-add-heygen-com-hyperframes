// The laboratory: room architecture, the table, the net, lab equipment and the lighting rig.

import * as THREE from 'three';
import { LAUNCH, NET, PALETTE, SUBSTANCES, TABLE } from '../config';
import { floorTextures, hazardTexture, netTexture, panelTexture, radialTexture, rng, tableTexture } from './textures';

const TOP = TABLE.height;

export interface LabLights {
  key: THREE.SpotLight;
  fill: THREE.HemisphereLight;
  rimL: THREE.SpotLight;
  rimR: THREE.SpotLight;
  accent: THREE.PointLight;
  pulse: THREE.PointLight;
}

/** Additive light cone with soft edges (cheap stand-in for volumetric light). */
function lightCone(height: number, radius: number, color: number, opacity: number) {
  const geo = new THREE.CylinderGeometry(0.04, radius, height, 48, 1, true);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uH: { value: height } },
    vertexShader: /* glsl */`
      varying float vY; varying vec3 vN; varying vec3 vView;
      void main(){
        vY = -position.y;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vView = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; uniform float uH;
      varying float vY; varying vec3 vN; varying vec3 vView;
      void main(){
        float edge = pow(abs(dot(normalize(vN), vView)), 1.6);
        float along = smoothstep(0.0, 0.18*uH, vY) * (1.0 - smoothstep(0.55*uH, uH, vY));
        gl_FragColor = vec4(uColor, edge * along * uOpacity);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

export class Lab {
  readonly root = new THREE.Group();
  readonly lights: LabLights;
  /** Things the intro reveals progressively. */
  readonly revealGroups: { table: THREE.Group; room: THREE.Group; props: THREE.Group };
  readonly emitter: THREE.Group;
  readonly emitterRing: THREE.Mesh;
  readonly coneMats: THREE.ShaderMaterial[] = [];
  readonly stripMats: THREE.MeshBasicMaterial[] = [];
  readonly tubeLiquids: THREE.Mesh[] = [];
  readonly accelerator: THREE.Group;
  readonly screens: THREE.CanvasTexture[] = [];
  readonly screenCanvases: HTMLCanvasElement[] = [];
  readonly floor: THREE.Mesh;
  readonly gravityGrid: THREE.Mesh;
  private bubbles!: THREE.Points;
  private disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene) {
    const table = new THREE.Group();
    const room = new THREE.Group();
    const props = new THREE.Group();
    this.revealGroups = { table, room, props };
    this.root.add(table, room, props);
    scene.add(this.root);

    this.floor = this.buildFloor(room);
    this.buildRoom(room);
    this.buildTable(table);
    this.buildNet(table);
    this.accelerator = this.buildAccelerator(props);
    this.buildChemStation(props);
    this.buildMonitorWall(props);
    const em = this.buildEmitter(props);
    this.emitter = em.group;
    this.emitterRing = em.ring;
    this.gravityGrid = this.buildGravityGrid(props);
    this.lights = this.buildLights(scene);
  }

  // ------------------------------------------------------------------ floor & room
  private buildFloor(parent: THREE.Group) {
    const { map, rough } = floorTextures();
    map.repeat.set(6, 6); rough.repeat.set(6, 6);
    const mat = new THREE.MeshStandardMaterial({
      map, roughnessMap: rough, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.45,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 72), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    parent.add(floor);

    // inset guide ring and play-area markings
    const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.22 });
    this.stripMats.push(ringMat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.15, 3.18, 128), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002;
    parent.add(ring);
    const tickGeo = new THREE.PlaneGeometry(0.02, 0.22);
    const ticks = new THREE.InstancedMesh(tickGeo, ringMat, 72);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      m.makeRotationX(-Math.PI / 2);
      m.premultiply(new THREE.Matrix4().makeRotationY(-a));
      m.setPosition(Math.cos(a) * 3.38, 0.002, Math.sin(a) * 3.38);
      ticks.setMatrixAt(i, m);
    }
    parent.add(ticks);
    // soft blob under the table to ground it
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 3.2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2; blob.rotation.z = Math.PI / 2; blob.position.y = 0.003;
    parent.add(blob);
    return floor;
  }

  private buildRoom(parent: THREE.Group) {
    const r = rng(3);
    const panelTex = panelTexture();
    const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.6, metalness: 0.55, envMapIntensity: 0.35 });
    const R = 9.5, H = 7.5, N = 28;
    const panelGeo = new THREE.BoxGeometry(2 * R * Math.tan(Math.PI / N) * 0.985, H, 0.25);
    const walls = new THREE.InstancedMesh(panelGeo, panelMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
      m.compose(new THREE.Vector3(Math.cos(a) * R, H / 2, Math.sin(a) * R), q, s);
      walls.setMatrixAt(i, m);
    }
    walls.receiveShadow = true;
    parent.add(walls);

    // vertical light strips between panels, only a few lit — rhythm, not decoration
    const stripMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.85 });
    const warmMat = new THREE.MeshBasicMaterial({ color: PALETTE.orange, transparent: true, opacity: 0.9 });
    this.stripMats.push(stripMat, warmMat);
    const stripGeo = new THREE.BoxGeometry(0.035, H * 0.62, 0.035);
    for (let i = 0; i < N; i++) {
      if (i % 2 === 1) continue;
      const a = ((i + 0.5) / N) * Math.PI * 2;
      const warm = i === 20 || i === 22;
      const strip = new THREE.Mesh(stripGeo, warm ? warmMat : stripMat);
      strip.position.set(Math.cos(a) * (R - 0.16), H * 0.42, Math.sin(a) * (R - 0.16));
      parent.add(strip);
    }
    // horizontal band at gallery height
    const band = new THREE.Mesh(new THREE.TorusGeometry(R - 0.2, 0.012, 6, 160), stripMat);
    band.rotation.x = Math.PI / 2; band.position.y = 4.9;
    parent.add(band);

    // gallery ledge
    const ledge = new THREE.Mesh(
      new THREE.RingGeometry(R - 1.1, R - 0.12, 96, 1),
      new THREE.MeshStandardMaterial({ color: 0x0f141b, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
    );
    ledge.rotation.x = -Math.PI / 2; ledge.position.y = 4.8;
    parent.add(ledge);

    // ceiling: dark dome with a truss ring carrying the light fixtures
    const ceil = new THREE.Mesh(
      new THREE.CircleGeometry(R + 0.3, 64),
      new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.9, metalness: 0.2, side: THREE.DoubleSide }),
    );
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
    parent.add(ceil);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x252c36, roughness: 0.45, metalness: 0.85 });
    for (const rad of [2.6, 2.9]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035, 8, 96), trussMat);
      t.rotation.x = Math.PI / 2; t.position.y = 5.2;
      parent.add(t);
    }
    const strut = new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6);
    const struts = new THREE.InstancedMesh(strut, trussMat, 48);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      q.setFromEuler(new THREE.Euler(0, -a, i % 2 ? 0.8 : -0.8));
      m.compose(new THREE.Vector3(Math.cos(a) * 2.75, 5.2, Math.sin(a) * 2.75), q, s);
      struts.setMatrixAt(i, m);
    }
    parent.add(struts);
    // hanging cables
    for (const a of [0.4, 2.0, 3.6, 5.2]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, H - 5.2, 4), trussMat);
      cable.position.set(Math.cos(a) * 2.75, 5.2 + (H - 5.2) / 2, Math.sin(a) * 2.75);
      parent.add(cable);
    }
    // fixtures (lamp housings) aimed at the table
    const housingGeo = new THREE.CylinderGeometry(0.12, 0.17, 0.32, 20, 1, true);
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1f27, roughness: 0.4, metalness: 0.9, side: THREE.DoubleSide });
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff });
    for (const [x, z] of [[0, 0], [-1.6, -2.2], [1.6, -2.2], [-1.6, 2.2], [1.6, 2.2]]) {
      const h = new THREE.Mesh(housingGeo, housingMat);
      h.position.set(x, 5.05, z);
      parent.add(h);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), lensMat);
      lens.rotation.x = Math.PI / 2; lens.position.set(x, 4.9, z);
      parent.add(lens);
    }
    // a single hero cone of light on the table
    const hero = lightCone(4.1, 1.85, 0xcfeaff, 0.11);
    hero.position.set(0, 4.9, 0);
    parent.add(hero);
    this.coneMats.push(hero.material as THREE.ShaderMaterial);
    // a couple of architectural columns that frame the space
    const colMat = new THREE.MeshStandardMaterial({ color: 0x131921, roughness: 0.5, metalness: 0.7 });
    for (const a of [0.95, 2.19, 4.09, 5.33]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), colMat);
      col.position.set(Math.cos(a) * (R - 0.6), H / 2, Math.sin(a) * (R - 0.6));
      col.rotation.y = -a;
      col.castShadow = false;
      parent.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.52), r() > 0.3 ? stripMat : warmMat);
      cap.position.copy(col.position).setY(0.6);
      cap.rotation.y = -a;
      parent.add(cap);
    }
  }

  // ------------------------------------------------------------------ table & net
  private buildTable(parent: THREE.Group) {
    const topMat = new THREE.MeshPhysicalMaterial({
      map: tableTexture(), color: 0xffffff, roughness: 0.55, metalness: 0.0,
      clearcoat: 0.18, clearcoatRoughness: 0.5, envMapIntensity: 0.45,
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.length), topMat);
    top.position.y = TOP - TABLE.thickness / 2;
    top.castShadow = true; top.receiveShadow = true;
    parent.add(top);

    // apron band under the top edge
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.5, metalness: 0.6 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width - 0.04, 0.05, TABLE.length - 0.04), apronMat);
    apron.position.y = TOP - TABLE.thickness - 0.025;
    parent.add(apron);
    // thin cyan underglow — the table hovers on light
    const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.22 });
    this.stripMats.push(glowMat);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width - 0.1, 0.006, TABLE.length - 0.1), glowMat);
    glow.position.y = TOP - TABLE.thickness - 0.052;
    parent.add(glow);

    // lines: white, very slightly raised
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xc9d1d8, roughness: 0.75, emissive: 0xffffff, emissiveIntensity: 0.0 });
    const lw = 0.02;
    const y = TOP + 0.0006;
    const lines: [number, number, number, number][] = [
      [0, -TABLE.halfL + lw / 2, TABLE.width, lw], [0, TABLE.halfL - lw / 2, TABLE.width, lw],
      [-TABLE.halfW + lw / 2, 0, lw, TABLE.length], [TABLE.halfW - lw / 2, 0, lw, TABLE.length],
      [0, 0, 0.003, TABLE.length],
    ];
    for (const [x, z, w, l] of lines) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat);
      g.rotation.x = -Math.PI / 2; g.position.set(x, y, z);
      g.receiveShadow = true;
      parent.add(g);
    }

    // undercarriage: two folding frames, legs with feet
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.35, metalness: 0.9 });
    const legGeo = new THREE.BoxGeometry(0.05, TOP - 0.08, 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, metal);
      leg.position.set(sx * (TABLE.halfW - 0.16), (TOP - 0.08) / 2, sz * (TABLE.halfL - 0.32));
      leg.castShadow = true;
      parent.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 16), metal);
      foot.position.set(leg.position.x, 0.015, leg.position.z);
      parent.add(foot);
    }
    for (const sz of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width - 0.3, 0.04, 0.04), metal);
      bar.position.set(0, 0.28, sz * (TABLE.halfL - 0.32));
      parent.add(bar);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, TABLE.halfL - 0.32), metal);
      brace.position.set(0, 0.5, sz * (TABLE.halfL - 0.32) / 2);
      brace.rotation.x = sz * 0.35;
      parent.add(brace);
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), metal);
    spine.position.set(0, TOP - 0.12, 0);
    parent.add(spine);
  }

  private buildNet(parent: THREE.Group) {
    const netMat = new THREE.MeshStandardMaterial({
      map: netTexture(), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.8,
      color: 0xdfe6ee,
    });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(NET.halfSpan * 2, NET.height - 0.012), netMat);
    net.position.set(0, TOP + (NET.height - 0.012) / 2, 0);
    net.castShadow = true;
    parent.add(net);
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(NET.halfSpan * 2, 0.014, 0.006),
      new THREE.MeshStandardMaterial({ color: 0xf6f8fa, roughness: 0.6 }),
    );
    tape.position.set(0, TOP + NET.height - 0.007, 0);
    tape.castShadow = true;
    parent.add(tape);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1d232c, roughness: 0.3, metalness: 0.95 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, NET.height + 0.02, 12), postMat);
      post.position.set(sx * NET.halfSpan, TOP + NET.height / 2, 0);
      parent.add(post);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.07), postMat);
      clamp.position.set(sx * (TABLE.halfW + 0.02), TOP - 0.01, 0);
      parent.add(clamp);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(NET.halfSpan - TABLE.halfW, 0.012, 0.02), postMat);
      arm.position.set(sx * (TABLE.halfW + (NET.halfSpan - TABLE.halfW) / 2), TOP + 0.01, 0);
      parent.add(arm);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
      led.position.set(sx * NET.halfSpan, TOP + NET.height + 0.016, 0);
      parent.add(led);
    }
  }

  // ------------------------------------------------------------------ props
  private buildAccelerator(parent: THREE.Group) {
    const g = new THREE.Group();
    g.position.set(0, 3.0, -7.2);
    const metal = new THREE.MeshStandardMaterial({ color: 0x1c222b, roughness: 0.35, metalness: 0.9 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.2, 20, 120), metal);
    g.add(ring);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.045, 8, 160),
      new THREE.MeshBasicMaterial({ color: PALETTE.cyan }),
    );
    inner.position.z = 0.19;
    g.add(inner);
    // magnet segments
    const segGeo = new THREE.BoxGeometry(0.5, 0.62, 0.62);
    const segMat = new THREE.MeshStandardMaterial({ color: 0x262d38, roughness: 0.3, metalness: 0.85 });
    const segs = new THREE.InstancedMesh(segGeo, segMat, 16);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
      m.compose(new THREE.Vector3(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0), q, s);
      segs.setMatrixAt(i, m);
    }
    g.add(segs);
    const orangeMat = new THREE.MeshBasicMaterial({ color: PALETTE.orange });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.02), i % 4 === 0 ? orangeMat : inner.material);
      tag.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0.32);
      tag.rotation.z = a;
      g.add(tag);
    }
    // base pedestal
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.2), metal);
    base.position.y = -2.9;
    g.add(base);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), metal);
    leg.position.y = -2.5;
    g.add(leg);
    // the orbiting "particle" — a bright dot circling the ring
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dot.name = 'orbiter';
    g.add(dot);
    parent.add(g);
    return g;
  }

  private buildChemStation(parent: THREE.Group) {
    const g = new THREE.Group();
    g.position.set(-4.4, 0, -2.6);
    g.rotation.y = 0.75;
    const metal = new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 0.4, metalness: 0.85 });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.9), metal);
    bench.position.y = 0.45;
    g.add(bench);
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.04, 1.0), new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.25, metalness: 0.3 }));
    benchTop.position.y = 0.92;
    g.add(benchTop);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfdcec, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18,
      clearcoat: 1, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false,
    });
    const subs = Object.values(SUBSTANCES);
    subs.forEach((sd, i) => {
      const x = -1.2 + i * 0.8;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 32, 1, true), glassMat);
      tube.position.set(x, 1.7, 0);
      g.add(tube);
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 1.0, 32),
        new THREE.MeshStandardMaterial({ color: sd.color, emissive: sd.color, emissiveIntensity: 0.9, transparent: true, opacity: 0.75, roughness: 0.2 }),
      );
      liquid.position.set(x, 1.48, 0);
      liquid.userData.baseY = 1.48;
      liquid.userData.phase = i * 1.3;
      this.tubeLiquids.push(liquid);
      g.add(liquid);
      for (const yy of [0.95, 2.45]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 32), metal);
        cap.position.set(x, yy, 0);
        g.add(cap);
      }
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.06), new THREE.MeshBasicMaterial({ color: sd.color }));
      label.position.set(x, 0.75, 0.452);
      g.add(label);
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 24, Math.PI), metal);
      pipe.position.set(x + 0.4, 2.5, 0);
      if (i < subs.length - 1) g.add(pipe);
    });
    // rising bubbles inside the tubes
    const count = 120;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const r = rng(5);
    for (let i = 0; i < count; i++) {
      const k = i % subs.length;
      pos[i * 3] = -1.2 + k * 0.8 + (r() - 0.5) * 0.25;
      pos[i * 3 + 1] = 1.0 + r() * 0.95;
      pos[i * 3 + 2] = (r() - 0.5) * 0.25;
      const c = new THREE.Color(subs[k].color).lerp(new THREE.Color(0xffffff), 0.5);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.bubbles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.035, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
      map: radialTexture(), blending: THREE.AdditiveBlending,
    }));
    g.add(this.bubbles);
    const lamp = new THREE.PointLight(0x9a7bff, 2.2, 4.5, 2);
    lamp.position.set(0, 1.8, 0.8);
    g.add(lamp);
    parent.add(g);
  }

  private buildMonitorWall(parent: THREE.Group) {
    const g = new THREE.Group();
    g.position.set(4.5, 0, -2.4);
    g.rotation.y = -0.8;
    const metal = new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.45, metalness: 0.8 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.2), metal);
    stand.position.y = 1.1;
    g.add(stand);
    const frames: [number, number, number, number][] = [[-0.95, 2.35, 1.6, 0.95], [0.95, 2.35, 1.6, 0.95], [0, 1.25, 1.2, 0.7]];
    frames.forEach(([x, y, w, h]) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.08), metal);
      frame.position.set(x, y, 0);
      g.add(frame);
      const cnv = document.createElement('canvas');
      cnv.width = 512; cnv.height = Math.round((512 * h) / w);
      const tex = new THREE.CanvasTexture(cnv);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.screens.push(tex);
      this.screenCanvases.push(cnv);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.set(x, y, 0.045);
      g.add(screen);
    });
    const glow = new THREE.PointLight(PALETTE.cyan, 1.6, 4, 2);
    glow.position.set(0, 2, 0.9);
    g.add(glow);
    // cable trays to the floor
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.4), metal);
    tray.position.set(0, 0.03, 0.4);
    g.add(tray);
    parent.add(g);
  }

  private buildEmitter(parent: THREE.Group) {
    const group = new THREE.Group();
    group.position.set(LAUNCH.x, LAUNCH.y, LAUNCH.z);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x20262f, roughness: 0.3, metalness: 0.95 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 12, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.06;
    group.add(ring);
    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.003, 6, 64),
      new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.9 }),
    );
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = -0.052;
    group.add(glowRing);
    // faint field column between halo and ball
    const field = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.058, 0.06, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    field.position.y = -0.03;
    group.add(field);
    // three tiny pylons below projecting a field
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x2a313b, roughness: 0.4, metalness: 0.9 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.02, LAUNCH.y - 0.07, 10), pylonMat);
    stem.position.set(0, -(LAUNCH.y - 0.07) / 2 - 0.07, 0.06);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.06), pylonMat);
    arm.position.set(0, -0.064, 0.03);
    group.add(arm);
    group.add(stem);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.04, 32), pylonMat);
    base.position.set(0, -LAUNCH.y + 0.02, 0.06);
    group.add(base);
    const baseGlow = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.158, 48), glowRing.material);
    baseGlow.rotation.x = -Math.PI / 2;
    baseGlow.position.set(0, -LAUNCH.y + 0.042, 0.06);
    group.add(baseGlow);
    parent.add(group);
    return { group, ring: glowRing };
  }

  private buildGravityGrid(parent: THREE.Group) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uG: { value: 1 }, uColor: { value: new THREE.Color(PALETTE.cyan) }, uAmount: { value: 0 } },
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uG; varying vec2 vUv; varying float vD;
        void main(){
          vUv = uv;
          vec3 p = position;
          float d = length(p.xy);
          float sag = (uG - 1.0) * 0.18 * exp(-d*d*0.35);
          p.z -= sag;
          vD = d;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uColor; uniform float uAmount; varying vec2 vUv; varying float vD;
        void main(){
          vec2 g = abs(fract(vUv*vec2(18.0,24.0)) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
          float fade = 1.0 - smoothstep(1.2, 2.6, vD);
          float pulse = 0.6 + 0.4*sin(uTime*3.0 - vD*4.0);
          gl_FragColor = vec4(uColor, line * fade * pulse * uAmount * 0.5);
        }`,
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 5.6, 44, 56), mat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = TOP + 1.25;
    grid.visible = false;
    parent.add(grid);
    return grid;
  }

  private buildLights(scene: THREE.Scene): LabLights {
    const fill = new THREE.HemisphereLight(0x5577aa, 0x0a0c10, 0.35);
    scene.add(fill);
    const key = new THREE.SpotLight(0xeef6ff, 38, 12, 0.42, 0.65, 1.6);
    key.position.set(0, 5, 0.3);
    key.target.position.set(0, TOP, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 8;
    scene.add(key, key.target);
    const rimL = new THREE.SpotLight(PALETTE.cyan, 34, 7.4, 0.36, 0.8, 1.2);
    rimL.position.set(-3.5, 4.2, -4.5);
    rimL.target.position.set(0, TOP + 0.3, 0.2);
    const rimR = new THREE.SpotLight(0x9fd8ff, 22, 7.4, 0.36, 0.8, 1.2);
    rimR.position.set(3.5, 4.2, -4.5);
    rimR.target.position.set(0, TOP + 0.3, 0.2);
    scene.add(rimL, rimL.target, rimR, rimR.target);
    const accent = new THREE.PointLight(PALETTE.orange, 5, 7, 2);
    accent.position.set(0, 3.0, -6.6);
    scene.add(accent);
    const pulse = new THREE.PointLight(PALETTE.cyan, 0, 3.5, 2);
    pulse.position.set(0, TOP + 0.25, -0.8);
    scene.add(pulse);
    return { key, fill, rimL, rimR, accent, pulse };
  }

  setShadowQuality(size: number) {
    const k = this.lights.key;
    if (k.shadow.mapSize.x === size) return;
    k.shadow.mapSize.set(size, size);
    k.shadow.map?.dispose();
    k.shadow.map = null as unknown as THREE.WebGLRenderTarget;
  }

  update(dt: number, time: number) {
    const orb = this.accelerator.getObjectByName('orbiter');
    if (orb) {
      const a = time * 1.6;
      orb.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0.22);
    }
    for (const l of this.tubeLiquids) {
      l.position.y = l.userData.baseY + Math.sin(time * 0.9 + l.userData.phase) * 0.015;
    }
    const pos = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * (0.18 + (i % 7) * 0.03);
      if (y > 1.95) y = 1.0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.emitterRing.rotation.z = time * 0.8;
    this.emitterRing.scale.setScalar(1 + Math.sin(time * 3) * 0.04);
    (this.gravityGrid.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  /** Visual hazard band texture shared by obstacles. */
  static hazard = (() => { let t: THREE.Texture | null = null; return () => (t ??= hazardTexture()); })();

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) m.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
  }
}
