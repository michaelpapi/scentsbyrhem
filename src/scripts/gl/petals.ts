// A drift of rose petals, in pixel units of the stage. Ambient: slow fall and sway. Burst: a short outward push.
import * as THREE from 'three';

export type Petals = { mesh: THREE.InstancedMesh; resize(w: number, h: number): void; update(dt: number, still: boolean): void; burst(x: number, y: number, power?: number): void; dispose(): void };

export function createPetals(count: number): Petals {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(0.5, 0.25, 0.55, 0.95, 0, 1.35); s.bezierCurveTo(-0.55, 0.95, -0.5, 0.25, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 6); geo.translate(0, -0.65, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  const palette = [0xf4c6d2, 0xfbe9ee, 0xe58da6, 0xf7d4de, 0xc86a86].map((c) => new THREE.Color(c));
  let W = 800, H = 600, unit = 10;
  const P = Array.from({ length: count }, () => ({
    p: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random()), v: new THREE.Vector3(), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    spin: new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6),
    fall: 0.02 + Math.random() * 0.05, sway: Math.random() * 6, amp: 0.02 + Math.random() * 0.05, s: 0.7 + Math.random() * 0.9,
  }));
  P.forEach((q, i) => mesh.setColorAt(i, palette[i % palette.length]));
  const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  let t = 0;
  // petal positions are kept as fractions of the stage (x, y in -0.5..0.5, z 0..1) so a resize needs no re-seeding
  const write = () => {
    P.forEach((q, i) => { qn.setFromEuler(q.r); sc.setScalar(q.s * unit); pos.set(q.p.x * W, -q.p.y * H, -260 + q.p.z * 380); m4.compose(pos, qn, sc); mesh.setMatrixAt(i, m4); });
    mesh.instanceMatrix.needsUpdate = true;
  };
  write();
  return {
    mesh,
    resize(w, h) { W = w; H = h; unit = Math.max(7, Math.min(w, h) * 0.017); write(); },
    update(dt, still) {
      if (still) return;
      t += dt;
      const drag = Math.exp(-2.2 * dt);
      for (const q of P) {
        q.p.y += q.fall * dt; q.p.x += Math.sin(t * 0.7 + q.sway) * q.amp * dt;     // y grows downward (screen)
        q.p.x += q.v.x * dt; q.p.y += q.v.y * dt; q.v.multiplyScalar(drag);
        q.r.x += q.spin.x * dt; q.r.y += q.spin.y * dt; q.r.z += q.spin.z * dt;
        if (q.p.y > 0.62) { q.p.y = -0.62; q.p.x = Math.random() - 0.5; q.v.set(0, 0, 0); }
      }
      write();
    },
    burst(x, y, power = 1) {
      const cx = x / W - 0.5, cy = y / H - 0.5;
      for (const q of P) {
        const dx = q.p.x - cx, dy = q.p.y - cy, len = Math.max(0.12, Math.hypot(dx, dy));
        q.v.set((dx / len) * power * 0.35 + (Math.random() - 0.5) * 0.2, (dy / len) * power * 0.35 - Math.random() * 0.1, 0);
        q.spin.multiplyScalar(1.6);
      }
    },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
}
