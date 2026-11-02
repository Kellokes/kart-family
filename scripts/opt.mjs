import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, prune, dedup, meshopt, quantize, normals } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder': MeshoptEncoder});
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp);
for (const m of doc.getRoot().listMaterials()) {
  const n = m.getNormalTexture(); const mr = m.getMetallicRoughnessTexture();
  m.setNormalTexture(null); m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0); m.setRoughnessFactor(0.8); m.setDoubleSided(false);
}
const tris = doc.getRoot().listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((b,p)=>b+(p.getIndices()?.getCount()||0)/3,0),0);
const ratio = Math.min(1, 14000/tris);
await doc.transform(
  prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }),
  normals({overwrite:true}),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024,1024], quality: 82 }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(out, doc);
console.log(out, Math.round(tris), '->', ratio.toFixed(4));
