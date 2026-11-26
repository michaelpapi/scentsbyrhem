// Optimise the supplied bottle models for the web: spec-gloss -> metal-rough, simplify, 1024px webp textures, meshopt.
// usage: node process-models.mjs <src dir> <out dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, simplify, prune, textureCompress, meshopt, metalRough, getSceneVertexCount } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
import { MeshoptDecoder } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// file -> output id, triangle budget, texture size, optional "drop the artwork on materials that use a texture of this size/format"
const JOBS = [
  { file: 'modernist_perfume_bottle.glb',        id: 'noir-facet',    tris: 20000, tex: 1024 },
  { file: 'fancy_perfume_bottle (1).glb',        id: 'velvet-oud',    tris: 20000, tex: 1024 },
  { file: 'fancy_perfume_bottle.glb',            id: 'amethyst',      tris: 20000, tex: 1024 },
  { file: 'art_nouveau_perfume_bottle.glb',      id: 'porcelain-rose',tris: 18000, tex: 1024 },
  { file: 'porcelain_perfume_bottle.glb',        id: 'garden-square', tris: 18000, tex: 1024 },
  { file: 'perfume_bottle__realistic_pbr_asset.glb', id: 'midnight-baroque', tris: 14000, tex: 1024 },
  { file: 'perfume_bottle_on_a_chain.glb',       id: 'heirloom-locket', tris: 22000, tex: 1024 },
  { file: 'perfume_bottle (2).glb',              id: 'amber-diamond', tris: 14000, tex: 512 },
  { file: 'perfume_bottle (1).glb',              id: 'blanc-fluted',  tris: 16000, tex: 1024 },
  { file: 'perfume_ch.glb',                      id: 'rose-cap',      tris: 20000, tex: 512, stripTextures: true },
  { file: 'perfume_bottle.glb',                  id: 'pink-crystal',  tris: 16000, tex: 1024 },
];

const only = process.argv[4];
for (const j of JOBS) {
  if (only && j.id !== only) continue;
  const doc = await io.read(`${src}/${j.file}`);
  const root = doc.getRoot();
  let tris = 0;
  root.listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }));
  const ratio = Math.min(1, j.tris / tris);
  if (j.stripTextures) {
    // the supplied bottle carries a repeating monogram print; drop the artwork and keep a plain colour
    for (const m of root.listMaterials()) {
      if (m.getBaseColorTexture()) { m.setBaseColorTexture(null); }
    }
  }
  const steps = [metalRough(), dedup(), flatten(), join(), weld()];
  if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002, lockBorder: false }));
  steps.push(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [j.tex, j.tex], quality: 78 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await doc.transform(...steps);
  const dst = `${out}/${j.id}.glb`;
  await io.write(dst, doc);
  let t2 = 0;
  doc.getRoot().listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const i = p.getIndices(); t2 += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }));
  console.log(`${j.id.padEnd(18)} ${(statSync(`${src}/${j.file}`).size / 1048576).toFixed(1).padStart(5)} MB -> ${(statSync(dst).size / 1024).toFixed(0).padStart(5)} KB   tris ${Math.round(tris)} -> ${Math.round(t2)}`);
}
