/** Import / export format tables for Meshora. */

export const IMPORT_EXTENSIONS = [
  'obj', 'fbx', 'gltf', 'glb', 'stl', 'ply', 'dae', '3ds', '3mf', 'off', 'x',
  'usdz', 'usd', 'usda', 'usdc', 'blend', 'max', 'x3d', 'bvh', 'lwo', 'lws', 'lxo',
  'md2', 'md3', 'md5mesh', 'md5anim', 'smd', 'ase', 'ifc', 'dxf', 'pmx',
  'b3d', 'ms3d', 'nff', 'raw', 'ter', 'ac', 'irrmesh', 'irr', 'mdl', 'hmp',
  'ndo', 'q3o', 'q3s', 'ogex', 'cob', 'scn', 'xgl', 'zgl',
  'mesh.xml', 'xml', 'mdc', 'md5camera', 'pk3', 'bsp', 'map', 'qc',
  'vta', 'm3d', 'assbin'
];

export const COMPANION_EXTENSIONS = [
  'mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'gif', 'tif',
  'tiff', 'ktx', 'basis', 'dds', 'hdr', 'exr'
];

/** assimpjs native export ids. */
export const ASSIMP_EXPORT = [
  { id: 'glb2', ext: 'glb', label: 'GLB', name: 'glTF 2.0 二进制', via: 'assimpjs', binary: true },
  { id: 'gltf2', ext: 'gltf', label: 'GLTF', name: 'glTF 2.0', via: 'assimpjs', binary: false, multiFile: true },
  { id: 'glb', ext: 'glb', label: 'GLB 1', name: 'glTF 1.0 二进制', via: 'assimpjs', binary: true, hidden: true },
  { id: 'gltf', ext: 'gltf', label: 'GLTF 1', name: 'glTF 1.0', via: 'assimpjs', binary: false, multiFile: true, hidden: true },
  { id: 'assjson', ext: 'json', label: 'JSON', name: 'Assimp JSON', via: 'assimpjs', binary: false, hidden: true }
];

/**
 * Extra writers implemented in-app from the imported scene (assjson).
 * Vertex positions are copied as imported — no remesh / simplify / unit scale.
 * STL and 3MF require triangles; assimpjs already triangulates on import.
 */
export const SCENE_EXPORT = [
  { id: 'obj', ext: 'obj', label: 'OBJ', name: 'Wavefront OBJ', via: 'scene', binary: false },
  { id: 'stl', ext: 'stl', label: 'STL', name: 'STL（二进制）', via: 'scene', binary: true, needsTriangles: true },
  { id: 'stla', ext: 'stl', label: 'STL 文本', name: 'STL（ASCII）', via: 'scene', binary: false, needsTriangles: true },
  { id: 'ply', ext: 'ply', label: 'PLY', name: 'Stanford PLY', via: 'scene', binary: false },
  { id: 'dae', ext: 'dae', label: 'DAE', name: 'Collada', via: 'scene', binary: false },
  { id: '3mf', ext: '3mf', label: '3MF', name: '3D Manufacturing', via: 'scene', binary: true, needsTriangles: true }
];

/**
 * Cinema 4D–ready interchange exports.
 * These write real .fbx / .glb that C4D can open — NOT native .c4d Melange projects.
 */
export const C4D_EXPORT = [
  {
    id: 'c4d-fbx',
    ext: 'fbx',
    label: 'C4D · FBX',
    name: 'Cinema 4D 可用 FBX（互换格式，非原生 .c4d）',
    via: 'c4d-fbx',
    binary: true,
    needsBlender: true,
    c4dInterchange: true
  },
  {
    id: 'c4d-glb',
    ext: 'glb',
    label: 'C4D · GLB',
    name: 'Cinema 4D 可用 GLB（互换格式，非原生 .c4d）',
    via: 'c4d-glb',
    binary: true,
    c4dInterchange: true
  }
];

export const EXPORT_FORMATS = [
  ...C4D_EXPORT,
  ...ASSIMP_EXPORT.filter((f) => !f.hidden),
  ...SCENE_EXPORT
];

export const FORMAT_LABELS = {
  obj: 'OBJ', fbx: 'FBX', gltf: 'GLTF', glb: 'GLB', stl: 'STL', ply: 'PLY',
  dae: 'DAE', '3ds': '3DS', '3mf': '3MF', off: 'OFF', x: 'X', usdz: 'USDZ',
  usd: 'USD', blend: 'BLEND', max: 'MAX', x3d: 'X3D', bvh: 'BVH', pmx: 'PMX',
  dxf: 'DXF', ifc: 'IFC', md2: 'MD2', md5mesh: 'MD5', smd: 'SMD', ase: 'ASE'
};

export function extOf(name) {
  const n = (name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i + 1) : '';
}

export function isPrimaryModel(name) {
  const ext = extOf(name);
  if (!ext) return false;
  if (COMPANION_EXTENSIONS.includes(ext) && !['glb', 'gltf'].includes(ext)) return false;
  return IMPORT_EXTENSIONS.includes(ext) || [
    'obj', 'fbx', 'gltf', 'glb', 'stl', 'ply', 'dae', '3ds', '3mf', 'off', 'x', 'blend', 'max'
  ].includes(ext);
}

export function isMaxFile(name) {
  return extOf(name) === 'max';
}

export function isBlendFile(name) {
  return extOf(name) === 'blend';
}

export function formatLabel(name) {
  const ext = extOf(name);
  return FORMAT_LABELS[ext] || ext.toUpperCase() || '—';
}

export function formatSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function replaceExt(name, ext) {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base}.${ext.replace(/^\./, '')}`;
}
