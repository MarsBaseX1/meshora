/**
 * Lossless scene exporters.
 * Vertices, UVs, normals, colors, and materials are copied from the imported
 * assjson scene. No remesh, simplify, or unit rescale.
 */

import JSZip from 'jszip';

const encoder = new TextEncoder();

function mat4FromArray(a) {
  if (!a || a.length < 16) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
  return a.slice(0, 16);
}

function mulMat4(a, b) {
  const r = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      r[row + c * 4] =
        a[row] * b[c * 4] +
        a[row + 4] * b[c * 4 + 1] +
        a[row + 8] * b[c * 4 + 2] +
        a[row + 12] * b[c * 4 + 3];
    }
  }
  return r;
}

function transformPoint(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  const nx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const ny = m[1] * x + m[5] * y + m[9] * z + m[13];
  const nz = m[2] * x + m[6] * y + m[10] * z + m[14];
  if (w && w !== 1) return [nx / w, ny / w, nz / w];
  return [nx, ny, nz];
}

function transformDir(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z
  ];
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function matName(scene, index, fallback) {
  const mats = scene.materials || [];
  const mat = mats[index];
  if (!mat || !mat.properties) return fallback;
  const prop = mat.properties.find((p) => p.key === '?mat.name' || p.key === '?mat.name');
  if (prop && prop.value) return String(prop.value).replace(/\s+/g, '_');
  return fallback;
}

function matColor(scene, index, key, fallback = [0.8, 0.8, 0.8]) {
  const mats = scene.materials || [];
  const mat = mats[index];
  if (!mat || !mat.properties) return fallback;
  const prop = mat.properties.find((p) => p.key === key);
  if (prop && Array.isArray(prop.value) && prop.value.length >= 3) {
    return prop.value.slice(0, 3);
  }
  return fallback;
}

/**
 * Flatten scene graph into world-space meshes.
 * Bakes node transforms so exported files look correct; does not rescale units
 * or alter local vertex data beyond the existing scene transform.
 */
export function flattenMeshes(scene) {
  const meshes = scene.meshes || [];
  const out = [];

  function walk(node, parent) {
    const local = mat4FromArray(node.transformation);
    const world = parent ? mulMat4(parent, local) : local;
    const indices = node.meshes || [];
    for (const mi of indices) {
      const mesh = meshes[mi];
      if (!mesh) continue;
      out.push({ mesh, world, name: mesh.name || node.name || `mesh_${mi}` });
    }
    for (const child of node.children || []) walk(child, world);
  }

  if (scene.rootnode) walk(scene.rootnode, null);
  else {
    meshes.forEach((mesh, i) => {
      out.push({
        mesh,
        world: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        name: mesh.name || `mesh_${i}`
      });
    });
  }
  return out;
}

function worldVertices(mesh, world) {
  const v = mesh.vertices || [];
  const out = [];
  for (let i = 0; i + 2 < v.length; i += 3) {
    out.push(transformPoint(world, v[i], v[i + 1], v[i + 2]));
  }
  return out;
}

function worldNormals(mesh, world) {
  const n = mesh.normals || [];
  if (!n.length) return [];
  const out = [];
  for (let i = 0; i + 2 < n.length; i += 3) {
    out.push(normalize(transformDir(world, n[i], n[i + 1], n[i + 2])));
  }
  return out;
}

export function collectStats(scene) {
  const meshes = scene.meshes || [];
  let vertices = 0;
  let faces = 0;
  for (const m of meshes) {
    vertices += (m.vertices || []).length / 3;
    faces += (m.faces || []).length;
  }
  const materials = (scene.materials || []).map((mat, i) => matName(scene, i, `材质 ${i + 1}`));
  return {
    vertices: Math.round(vertices),
    faces,
    meshCount: meshes.length,
    materials,
    materialCount: materials.length
  };
}

export function exportObj(scene, baseName = 'model') {
  const items = flattenMeshes(scene);
  const mtlName = `${baseName}.mtl`;
  let obj = `# Meshora — marsbasex.com\n# 几何按导入结果写出，未重网格 / 未缩放\nmtllib ${mtlName}\n`;
  let mtl = `# Meshora MTL\n`;
  let vOff = 1;
  let nOff = 1;
  let tOff = 1;
  const usedMats = new Set();

  items.forEach((item, idx) => {
    const { mesh, world, name } = item;
    const verts = worldVertices(mesh, world);
    const norms = worldNormals(mesh, world);
    const uvs = (mesh.texturecoords && mesh.texturecoords[0]) || [];
    const uvComp = (mesh.numuvcomponents && mesh.numuvcomponents[0]) || 2;
    const mat = matName(scene, mesh.materialindex ?? 0, `mat_${idx}`);
    usedMats.add(mesh.materialindex ?? 0);

    obj += `o ${name.replace(/\s+/g, '_') || 'mesh'}\n`;
    obj += `usemtl ${mat}\n`;
    for (const p of verts) obj += `v ${p[0]} ${p[1]} ${p[2]}\n`;
    if (uvs.length) {
      for (let i = 0; i < uvs.length; i += uvComp) {
        obj += `vt ${uvs[i]} ${uvs[i + 1] ?? 0}\n`;
      }
    }
    for (const n of norms) obj += `vn ${n[0]} ${n[1]} ${n[2]}\n`;

    const faces = mesh.faces || [];
    const hasUv = uvs.length > 0;
    const hasN = norms.length > 0;
    for (const face of faces) {
      if (!face || face.length < 3) continue;
      const parts = face.map((vi) => {
        const v = vi + vOff;
        const t = hasUv ? vi + tOff : null;
        const n = hasN ? vi + nOff : null;
        if (hasUv && hasN) return `${v}/${t}/${n}`;
        if (hasN) return `${v}//${n}`;
        if (hasUv) return `${v}/${t}`;
        return `${v}`;
      });
      obj += `f ${parts.join(' ')}\n`;
    }
    vOff += verts.length;
    nOff += norms.length;
    tOff += uvs.length ? uvs.length / uvComp : 0;
  });

  (scene.materials || []).forEach((mat, i) => {
    const name = matName(scene, i, `mat_${i}`);
    const kd = matColor(scene, i, '$clr.diffuse', [0.78, 0.55, 0.42]);
    const ka = matColor(scene, i, '$clr.ambient', [0.12, 0.12, 0.12]);
    const ks = matColor(scene, i, '$clr.specular', [0.2, 0.2, 0.2]);
    mtl += `newmtl ${name}\nKa ${ka[0]} ${ka[1]} ${ka[2]}\nKd ${kd[0]} ${kd[1]} ${kd[2]}\nKs ${ks[0]} ${ks[1]} ${ks[2]}\nNs 16\nillum 2\n\n`;
  });
  if (!(scene.materials || []).length) {
    mtl += `newmtl mat_0\nKd 0.78 0.55 0.42\nillum 1\n`;
  }

  return [
    { name: `${baseName}.obj`, data: encoder.encode(obj) },
    { name: mtlName, data: encoder.encode(mtl) }
  ];
}

function triangulate(face) {
  if (face.length === 3) return [face];
  const tris = [];
  for (let i = 1; i + 1 < face.length; i++) {
    tris.push([face[0], face[i], face[i + 1]]);
  }
  return tris;
}

export function exportStlBinary(scene) {
  const items = flattenMeshes(scene);
  let triCount = 0;
  const tris = [];
  for (const item of items) {
    const verts = worldVertices(item.mesh, item.world);
    for (const face of item.mesh.faces || []) {
      for (const t of triangulate(face)) {
        const a = verts[t[0]];
        const b = verts[t[1]];
        const c = verts[t[2]];
        if (!a || !b || !c) continue;
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const n = normalize([nx, ny, nz]);
        tris.push({ n, a, b, c });
        triCount++;
      }
    }
  }
  const buf = new ArrayBuffer(80 + 4 + triCount * 50);
  const view = new DataView(buf);
  const header = encoder.encode('Meshora STL — geometry copied, not remeshed');
  for (let i = 0; i < Math.min(80, header.length); i++) view.setUint8(i, header[i]);
  view.setUint32(80, triCount, true);
  let o = 84;
  for (const t of tris) {
    view.setFloat32(o, t.n[0], true); view.setFloat32(o + 4, t.n[1], true); view.setFloat32(o + 8, t.n[2], true);
    view.setFloat32(o + 12, t.a[0], true); view.setFloat32(o + 16, t.a[1], true); view.setFloat32(o + 20, t.a[2], true);
    view.setFloat32(o + 24, t.b[0], true); view.setFloat32(o + 28, t.b[1], true); view.setFloat32(o + 32, t.b[2], true);
    view.setFloat32(o + 36, t.c[0], true); view.setFloat32(o + 40, t.c[1], true); view.setFloat32(o + 44, t.c[2], true);
    view.setUint16(o + 48, 0, true);
    o += 50;
  }
  return [{ name: 'model.stl', data: new Uint8Array(buf) }];
}

export function exportStlAscii(scene, baseName = 'model') {
  const items = flattenMeshes(scene);
  let out = `solid ${baseName}\n`;
  for (const item of items) {
    const verts = worldVertices(item.mesh, item.world);
    for (const face of item.mesh.faces || []) {
      for (const t of triangulate(face)) {
        const a = verts[t[0]];
        const b = verts[t[1]];
        const c = verts[t[2]];
        if (!a || !b || !c) continue;
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const n = normalize([nx, ny, nz]);
        out += `  facet normal ${n[0]} ${n[1]} ${n[2]}\n    outer loop\n`;
        out += `      vertex ${a[0]} ${a[1]} ${a[2]}\n`;
        out += `      vertex ${b[0]} ${b[1]} ${b[2]}\n`;
        out += `      vertex ${c[0]} ${c[1]} ${c[2]}\n`;
        out += `    endloop\n  endfacet\n`;
      }
    }
  }
  out += `endsolid ${baseName}\n`;
  return [{ name: `${baseName}.stl`, data: encoder.encode(out) }];
}

export function exportPly(scene, baseName = 'model') {
  const items = flattenMeshes(scene);
  const verts = [];
  const faces = [];
  let hasN = false;
  let hasUv = false;
  let hasC = false;
  for (const item of items) {
    const vs = worldVertices(item.mesh, item.world);
    const ns = worldNormals(item.mesh, item.world);
    const uvs = (item.mesh.texturecoords && item.mesh.texturecoords[0]) || [];
    const uvComp = (item.mesh.numuvcomponents && item.mesh.numuvcomponents[0]) || 2;
    const cols = (item.mesh.colors && item.mesh.colors[0]) || [];
    if (ns.length) hasN = true;
    if (uvs.length) hasUv = true;
    if (cols.length) hasC = true;
    const base = verts.length;
    for (let i = 0; i < vs.length; i++) {
      const p = vs[i];
      const n = ns[i] || [0, 0, 1];
      const u = uvs.length ? uvs[i * uvComp] : 0;
      const v = uvs.length ? uvs[i * uvComp + 1] : 0;
      const cr = cols.length ? Math.round((cols[i * 4] || 0) * 255) : 200;
      const cg = cols.length ? Math.round((cols[i * 4 + 1] || 0) * 255) : 140;
      const cb = cols.length ? Math.round((cols[i * 4 + 2] || 0) * 255) : 90;
      verts.push({ p, n, u, v, cr, cg, cb });
    }
    for (const face of item.mesh.faces || []) {
      if (!face || face.length < 3) continue;
      faces.push(face.map((vi) => vi + base));
    }
  }
  let header = `ply\nformat ascii 1.0\ncomment Meshora — geometry copied, not remeshed\nelement vertex ${verts.length}\nproperty float x\nproperty float y\nproperty float z\n`;
  if (hasN) header += `property float nx\nproperty float ny\nproperty float nz\n`;
  if (hasUv) header += `property float s\nproperty float t\n`;
  if (hasC) header += `property uchar red\nproperty uchar green\nproperty uchar blue\n`;
  header += `element face ${faces.length}\nproperty list uchar int vertex_indices\nend_header\n`;
  let body = '';
  for (const v of verts) {
    let line = `${v.p[0]} ${v.p[1]} ${v.p[2]}`;
    if (hasN) line += ` ${v.n[0]} ${v.n[1]} ${v.n[2]}`;
    if (hasUv) line += ` ${v.u} ${v.v}`;
    if (hasC) line += ` ${v.cr} ${v.cg} ${v.cb}`;
    body += line + '\n';
  }
  for (const f of faces) body += `${f.length} ${f.join(' ')}\n`;
  return [{ name: `${baseName}.ply`, data: encoder.encode(header + body) }];
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportDae(scene, baseName = 'model') {
  const items = flattenMeshes(scene);
  let geos = '';
  let nodes = '';
  items.forEach((item, idx) => {
    const id = `mesh_${idx}`;
    const verts = worldVertices(item.mesh, item.world);
    const norms = worldNormals(item.mesh, item.world);
    const uvs = (item.mesh.texturecoords && item.mesh.texturecoords[0]) || [];
    const uvComp = (item.mesh.numuvcomponents && item.mesh.numuvcomponents[0]) || 2;
    const pos = verts.flat().join(' ');
    const nrm = (norms.length ? norms : verts.map(() => [0, 0, 1])).flat().join(' ');
    let sources = `
      <source id="${id}-pos"><float_array id="${id}-pos-array" count="${verts.length * 3}">${pos}</float_array>
        <technique_common><accessor source="#${id}-pos-array" count="${verts.length}" stride="3">
          <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
        </accessor></technique_common></source>
      <source id="${id}-nrm"><float_array id="${id}-nrm-array" count="${(norms.length || verts.length) * 3}">${nrm}</float_array>
        <technique_common><accessor source="#${id}-nrm-array" count="${norms.length || verts.length}" stride="3">
          <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
        </accessor></technique_common></source>`;
    let uvInput = '';
    if (uvs.length) {
      const uvStr = [];
      for (let i = 0; i < uvs.length; i += uvComp) uvStr.push(`${uvs[i]} ${uvs[i + 1] ?? 0}`);
      sources += `<source id="${id}-uv"><float_array id="${id}-uv-array" count="${uvStr.length * 2}">${uvStr.join(' ')}</float_array>
        <technique_common><accessor source="#${id}-uv-array" count="${uvStr.length}" stride="2">
          <param name="S" type="float"/><param name="T" type="float"/>
        </accessor></technique_common></source>`;
      uvInput = `<input semantic="TEXCOORD" source="#${id}-uv" offset="0" set="0"/>`;
    }
    const faces = item.mesh.faces || [];
    const p = [];
    let triCount = 0;
    for (const face of faces) {
      for (const t of triangulate(face)) {
        p.push(t[0], t[1], t[2]);
        triCount++;
      }
    }
    geos += `<geometry id="${id}" name="${xmlEscape(item.name)}"><mesh>
      ${sources}
      <vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>
      <triangles count="${triCount}">
        <input semantic="VERTEX" source="#${id}-vtx" offset="0"/>
        <input semantic="NORMAL" source="#${id}-nrm" offset="0"/>
        ${uvInput}
        <p>${p.join(' ')}</p>
      </triangles>
    </mesh></geometry>`;
    nodes += `<node id="node_${idx}" name="${xmlEscape(item.name)}"><instance_geometry url="#${id}"/></node>`;
  });

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><contributor><author>marsbasex.com</author><authoring_tool>Meshora 1.0.0</authoring_tool></contributor>
    <created>${new Date().toISOString()}</created><up_axis>Y_UP</up_axis></asset>
  <library_geometries>${geos}</library_geometries>
  <library_visual_scenes><visual_scene id="Scene" name="Scene">${nodes}</visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>
`;
  return [{ name: `${baseName}.dae`, data: encoder.encode(xml) }];
}

export async function export3mf(scene, baseName = 'model') {
  const items = flattenMeshes(scene);
  let objects = '';
  let build = '';
  items.forEach((item, idx) => {
    const id = idx + 1;
    const verts = worldVertices(item.mesh, item.world);
    let vxml = '';
    for (const p of verts) vxml += `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`;
    let txml = '';
    for (const face of item.mesh.faces || []) {
      for (const t of triangulate(face)) {
        if (verts[t[0]] && verts[t[1]] && verts[t[2]]) {
          txml += `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`;
        }
      }
    }
    objects += `<object id="${id}" name="${xmlEscape(item.name)}" type="model"><mesh><vertices>${vxml}</vertices><triangles>${txml}</triangles></mesh></object>`;
    build += `<item objectid="${id}"/>`;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="zh-CN" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Meshora 1.0.0</metadata>
  <metadata name="Title">${xmlEscape(baseName)}</metadata>
  <resources>${objects}</resources>
  <build>${build}</build>
</model>`;
  const ctypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', ctypes);
  zip.folder('_rels').file('.rels', rels);
  zip.folder('3D').file('3dmodel.model', model);
  const buf = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return [{ name: `${baseName}.3mf`, data: buf }];
}

export async function exportById(id, scene, baseName) {
  switch (id) {
    case 'obj': return exportObj(scene, baseName);
    case 'stl': return exportStlBinary(scene).map((f) => ({ ...f, name: `${baseName}.stl` }));
    case 'stla': return exportStlAscii(scene, baseName);
    case 'ply': return exportPly(scene, baseName);
    case 'dae': return exportDae(scene, baseName);
    case '3mf': return export3mf(scene, baseName);
    default: throw new Error(`未知导出格式：${id}`);
  }
}
