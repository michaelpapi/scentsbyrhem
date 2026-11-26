// Loads a bottle (GLB, meshopt + WebP textures), fixes its orientation, and scales it so every bottle is about 1 unit tall and sits on y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Item } from '../data';
import type { GLMode } from './glmode';

export type Loaded = { object: THREE.Group; width: number; height: number };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Loaded>>();
const raw = new Map<string, Promise<ArrayBuffer>>();
let mode: GLMode = 'full';
export const setModelMode = (m: GLMode) => { mode = m; };

function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshPhysicalMaterial[]) {
      if (mode === 'lite' && mat.transmission > 0) { // real glass costs a second render pass: fake it with plain transparency on weaker phones
        mat.transmission = 0; mat.transparent = true; mat.opacity = Math.min(mat.opacity, 0.42); mat.depthWrite = false;
      }
      if (mat.transparent) m.renderOrder = 2;
      if (mat.map) mat.map.anisotropy = 4;
    }
  });
}

/** start downloading a bottle's file now (all of them can download side by side; they are parsed one at a time later) */
export function prefetch(it: Item): Promise<ArrayBuffer> {
  let p = raw.get(it.id);
  if (!p) {
    p = fetch(`/models/${it.model}.glb`).then((r) => { if (!r.ok) throw new Error(`model ${it.model}: ${r.status}`); return r.arrayBuffer(); });
    raw.set(it.id, p);
  }
  return p;
}

export function loadModel(it: Item): Promise<Loaded> {
  let p = cache.get(it.id);
  if (!p) {
    p = prefetch(it).then((buf) => loader.parseAsync(buf, '/models/')).then((g) => {
        const inner = g.scene;
        const fix = new THREE.Group();
        fix.add(inner);
        if (it.rot) fix.rotation.set(...(it.rot.map((d) => (d * Math.PI) / 180) as [number, number, number]));
        prepare(inner);
        const wrap = new THREE.Group(); wrap.add(fix);
        wrap.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(wrap);
        const size = box.getSize(new THREE.Vector3());
        const wide = Math.max(size.x, size.z);
        const k = Math.min(1 / size.y, 0.92 / wide) * (it.scale ?? 1);
        const c = box.getCenter(new THREE.Vector3());
        fix.position.set(-c.x, -box.min.y, -c.z);          // centre it, stand it on y = 0 (before scaling)
        const root = new THREE.Group(); root.add(wrap); root.scale.setScalar(k);
        wrap.position.set(0, 0, 0);
        return { object: root, width: wide * k, height: size.y * k } as Loaded;
    });
    cache.set(it.id, p);
  }
  return p;
}
