import packageJson from '../package.json';
import { Viewport } from './viewport.js';
import { importScene, exportAssimp } from './converter.js';
import { exportById } from './exporters.js';
import {
  EXPORT_FORMATS,
  extOf,
  formatLabel,
  formatSize,
  isPrimaryModel,
  isMaxFile,
  isBlendFile,
  replaceExt,
  COMPANION_EXTENSIONS
} from './formats.js';

const api = window.meshora;
const $ = (id) => document.getElementById(id);
$('aboutTitle').textContent = `Meshora ${packageJson.version}`;

const state = {
  files: [], // { id, name, size, data, path?, companions: [], kind? }
  activeId: null,
  cache: new Map(), // id -> { glb, scene, stats, previewStats, source? }
  target: 'c4d-glb',
  grid: true,
  wire: false,
  spin: false,
  blender: { found: false, path: null, statusText: '未找到' }
};

const viewport = new Viewport($('view'));
let fileSeq = 0;

const MAX_GUIDE =
  '无法直接读取 .max（需 3ds Max）。请先在 3ds Max 中导出为 FBX，再导入本应用，并用「C4D · FBX / C4D · GLB」导出给 Cinema 4D。';

const BLEND_GUIDE =
  '未找到 Blender。请安装 Blender（https://www.blender.org）并在「设置」中指定 blender.exe，或将其加入 PATH。安装后即可预览 .blend 并导出给 C4D。';

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'ok' ? 'ok' : ''}`;
  el.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function setLoading(on, text) {
  $('loadingVeil').hidden = !on;
  if (text) $('loadingText').textContent = text;
}

function showAbout(on) {
  $('aboutOverlay').hidden = !on;
}

function showSettings(on) {
  $('settingsOverlay').hidden = !on;
  if (on) refreshBlenderStatus();
}

function current() {
  return state.files.find((f) => f.id === state.activeId) || null;
}

async function refreshBlenderStatus() {
  if (!api?.blenderStatus) {
    state.blender = { found: false, path: null, statusText: '仅 Electron 可用' };
  } else {
    try {
      state.blender = await api.blenderStatus();
    } catch {
      state.blender = { found: false, path: null, statusText: '未找到' };
    }
  }
  const statusEl = $('blenderStatus');
  const pathEl = $('blenderPath');
  if (statusEl) {
    statusEl.textContent = state.blender.found ? '已找到' : '未找到';
    statusEl.className = `blender-status ${state.blender.found ? 'ok' : 'bad'}`;
  }
  if (pathEl) {
    pathEl.textContent = state.blender.path || state.blender.configuredPath || '（未设置）';
  }
  updateHint();
}

function formatIcon(fmt) {
  const shapes = {
    cube: '<path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2v8.3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    triangle: '<path d="m12 4 9 16H3L12 4Z"/><path d="M12 10v4m0 3h.01"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    network: '<circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="6" r="1.5"/><circle cx="19" cy="6" r="1.5"/><circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="18" r="1.5"/><path d="m10 10-4-3m8 3 4-3m-8 7-4 3m8-3 4 3"/>'
  };
  let type = 'file';
  if (fmt.id === 'c4d-fbx' || fmt.id === '3mf') type = 'layers';
  else if (fmt.id === 'c4d-glb' || fmt.id === 'obj' || fmt.id === 'glb2') type = 'cube';
  else if (fmt.id === 'stl' || fmt.id === 'stla') type = 'triangle';
  else if (fmt.id === 'ply') type = 'grid';
  else if (fmt.id === 'dae') type = 'network';
  return `<svg class="fmt-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${shapes[type]}</svg>`;
}

function renderFormats() {
  const grid = $('formatGrid');
  grid.innerHTML = '';
  for (const fmt of EXPORT_FORMATS) {
    const active = state.target === fmt.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `fmt${active ? ' active' : ''}${fmt.c4dInterchange ? ' c4d' : ''}`;
    btn.innerHTML = `${formatIcon(fmt)}<span class="fmt-label"></span>`;
    btn.querySelector('.fmt-label').textContent = fmt.label;
    btn.title = fmt.name;
    btn.setAttribute('aria-label', fmt.name);
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => {
      state.target = fmt.id;
      renderFormats();
      updateHint();
    });
    grid.appendChild(btn);
  }
  updateHint();
}

function updateHint() {
  const fmt = EXPORT_FORMATS.find((f) => f.id === state.target);
  $('triNotice').hidden = !(fmt && fmt.needsTriangles);
  const hint = $('formatHint');
  if (!hint) return;
  if (fmt?.c4dInterchange) {
    hint.textContent =
      'C4D · FBX / C4D · GLB 写出 Cinema 4D 可打开的互换文件（.fbx / .glb），不是原生 .c4d 工程。FBX 导出需要本机安装 Blender。';
  } else {
    hint.textContent =
      'GLB / GLTF 由 assimpjs 写出。OBJ / STL / PLY / DAE / 3MF 按导入场景原样写出顶点，不做重网格。';
  }
}

function renderFiles() {
  $('fileCount').textContent = String(state.files.length);
  const list = $('fileList');
  list.innerHTML = '';
  for (const file of state.files) {
    const row = document.createElement('div');
    row.className = `file-item${file.id === state.activeId ? ' active' : ''}${file.blocked ? ' blocked' : ''}`;
    row.innerHTML = `
      <span class="chip"></span>
      <div class="file-meta">
        <div class="file-name"></div>
        <div class="file-sub">${formatSize(file.size)}${file.blocked ? ' · 需先转 FBX' : ''}</div>
      </div>
      <button class="file-x" type="button" title="移除文件" aria-label="移除文件">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
      </button>
    `;
    row.querySelector('.chip').textContent = formatLabel(file.name);
    row.querySelector('.file-name').textContent = file.name;
    row.querySelector('.file-name').title = file.name;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.file-x')) return;
      selectFile(file.id);
    });
    row.querySelector('.file-x').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(file.id);
    });
    list.appendChild(row);
  }
  const has = state.files.some((f) => !f.blocked);
  $('btnExport').disabled = !has;
  $('btnExportAs').disabled = !has;
}

function setStats(file, stats) {
  $('stName').textContent = file ? file.name : '—';
  $('stFormat').textContent = file ? formatLabel(file.name) : '—';
  $('stSize').textContent = file ? formatSize(file.size) : '—';
  $('stVerts').textContent = stats ? stats.vertices.toLocaleString('zh-CN') : '—';
  $('stFaces').textContent = stats ? stats.faces.toLocaleString('zh-CN') : '—';
  const mats = stats && stats.materials && stats.materials.length
    ? stats.materials.join('、')
    : stats && stats.materialCount
      ? String(stats.materialCount)
      : '—';
  $('stMats').textContent = mats;
}

async function selectFile(id) {
  state.activeId = id;
  renderFiles();
  const file = current();
  if (!file) {
    viewport.clear();
    $('emptyState').classList.remove('hidden');
    setStats(null, null);
    return;
  }
  if (file.blocked) {
    viewport.clear();
    $('emptyState').classList.remove('hidden');
    setStats(file, null);
    toast(MAX_GUIDE, 'error');
    return;
  }
  try {
    setLoading(true, isBlendFile(file.name) ? '正在通过 Blender 转换预览…' : '正在解析并生成预览…');
    const packed = await ensureCache(file);
    await viewport.loadGlb(packed.glb.data);
    $('emptyState').classList.add('hidden');
    setStats(file, {
      vertices: packed.stats.vertices || packed.previewStats?.vertices || 0,
      faces: packed.stats.faces || packed.previewStats?.faces || 0,
      materials: packed.stats.materials || []
    });
  } catch (err) {
    try {
      await viewport.loadFallback(file.data, extOf(file.name));
      $('emptyState').classList.add('hidden');
      toast('已使用备用加载器预览', 'info');
    } catch (err2) {
      toast(`预览失败：${err.message || err}`, 'error');
    }
  } finally {
    setLoading(false);
  }
}

function payloadOf(file) {
  const extras = file.companions || [];
  return [{ name: file.name, data: file.data }, ...extras];
}

async function importBlendViaBlender(file) {
  if (!api?.blenderConvert) {
    throw new Error(BLEND_GUIDE);
  }
  await refreshBlenderStatus();
  if (!state.blender.found) {
    throw new Error(BLEND_GUIDE);
  }
  const result = await api.blenderConvert({
    inputPath: file.path || null,
    inputData: file.path ? null : file.data,
    inputName: file.name,
    format: 'glb'
  });
  const glbData = new Uint8Array(result.data);
  // Re-import GLB through assimpjs for scene JSON / stats when possible.
  let scenePack = null;
  try {
    scenePack = await importScene([{ name: replaceExt(file.name, 'glb'), data: glbData }]);
  } catch {
    scenePack = null;
  }
  return {
    glb: { name: replaceExt(file.name, 'glb'), data: glbData },
    scene: scenePack?.scene || null,
    stats: scenePack?.stats || { vertices: 0, faces: 0, materials: [], meshCount: 0, materialCount: 0 },
    source: 'blender',
    blendPath: file.path || null
  };
}

async function ensureCache(file) {
  if (state.cache.has(file.id)) return state.cache.get(file.id);
  if (isMaxFile(file.name)) {
    throw new Error(MAX_GUIDE);
  }
  if (isBlendFile(file.name)) {
    const packed = await importBlendViaBlender(file);
    state.cache.set(file.id, packed);
    return packed;
  }
  const result = await importScene(payloadOf(file));
  result.source = 'assimpjs';
  state.cache.set(file.id, result);
  return result;
}

function removeFile(id) {
  state.files = state.files.filter((f) => f.id !== id);
  state.cache.delete(id);
  if (state.activeId === id) {
    state.activeId = state.files[0]?.id || null;
    if (state.activeId) selectFile(state.activeId);
    else {
      viewport.clear();
      $('emptyState').classList.remove('hidden');
      setStats(null, null);
      renderFiles();
    }
  } else {
    renderFiles();
  }
}

async function ingestBrowserFiles(fileList) {
  const arr = Array.from(fileList || []);
  if (!arr.length) return;
  const buffers = await Promise.all(arr.map(async (f) => ({
    name: f.name,
    size: f.size,
    data: new Uint8Array(await f.arrayBuffer())
  })));
  ingestNamed(buffers);
}

function ingestNamed(items) {
  const companions = items.filter((f) => COMPANION_EXTENSIONS.includes(extOf(f.name)) && !isPrimaryModel(f.name));
  const primaries = items.filter((f) => isPrimaryModel(f.name));
  const leftover = items.filter((f) => !primaries.includes(f) && !companions.includes(f));
  const added = [];
  const source = primaries.length ? primaries : leftover;
  if (!source.length) {
    toast('没有可识别的 3D 模型', 'error');
    return;
  }
  for (const item of source) {
    const blocked = isMaxFile(item.name);
    const rec = {
      id: `f${++fileSeq}`,
      name: item.name,
      size: item.size ?? item.data?.byteLength ?? 0,
      data: item.data instanceof Uint8Array ? item.data : item.data ? new Uint8Array(item.data) : new Uint8Array(),
      path: item.path || null,
      companions: companions.map((c) => ({ name: c.name, data: c.data })),
      blocked
    };
    state.files.push(rec);
    added.push(rec);
    if (blocked) toast(MAX_GUIDE, 'error');
  }
  renderFiles();
  const firstOk = added.find((f) => !f.blocked) || added[0];
  if (firstOk) selectFile(firstOk.id);
}

async function openNative() {
  if (api?.openFiles) {
    try {
      const list = await api.openFiles();
      if (list && list.length) {
        ingestNamed(list.map((f) => ({
          name: f.name,
          size: f.size,
          data: new Uint8Array(f.data),
          path: f.path || null
        })));
        return;
      }
      if (list && list.length === 0) return;
    } catch (err) {
      console.warn(err);
    }
  }
  $('fileInput').click();
}

function targetFormat() {
  return EXPORT_FORMATS.find((f) => f.id === state.target);
}

async function glbBytesFor(file) {
  const packed = await ensureCache(file);
  if (packed?.glb?.data) return packed.glb.data instanceof Uint8Array ? packed.glb.data : new Uint8Array(packed.glb.data);
  throw new Error('没有可用的 GLB 预览数据');
}

async function exportC4dGlb(file) {
  const data = await glbBytesFor(file);
  return [{ name: replaceExt(file.name, 'glb'), data }];
}

async function exportC4dFbx(file) {
  await refreshBlenderStatus();
  if (!api?.blenderConvert || !state.blender.found) {
    throw new Error('导出 C4D · FBX 需要 Blender。可改用 C4D · GLB，或在设置中配置 Blender。');
  }
  // Prefer original .blend → FBX; otherwise GLB → FBX round-trip.
  if (isBlendFile(file.name)) {
    const result = await api.blenderConvert({
      inputPath: file.path || null,
      inputData: file.path ? null : file.data,
      inputName: file.name,
      format: 'fbx'
    });
    return [{ name: replaceExt(file.name, 'fbx'), data: new Uint8Array(result.data) }];
  }
  const glb = await glbBytesFor(file);
  const result = await api.blenderConvert({
    inputData: glb,
    inputName: replaceExt(file.name, 'glb'),
    format: 'fbx'
  });
  return [{ name: replaceExt(file.name, 'fbx'), data: new Uint8Array(result.data) }];
}

async function buildExport(file) {
  if (file.blocked || isMaxFile(file.name)) {
    throw new Error(MAX_GUIDE);
  }
  const fmt = targetFormat();
  if (fmt.via === 'c4d-glb') return exportC4dGlb(file);
  if (fmt.via === 'c4d-fbx') return exportC4dFbx(file);
  if (fmt.via === 'assimpjs') {
    if (isBlendFile(file.name)) {
      // assimpjs cannot read modern .blend reliably; export from cached GLB via assimp.
      const glb = await glbBytesFor(file);
      const out = await exportAssimp([{ name: replaceExt(file.name, 'glb'), data: glb }], fmt.id);
      return out.map((f, i) => ({
        name: i === 0 ? replaceExt(file.name, fmt.ext) : (f.name.split(/[\\/]/).pop() || f.name),
        data: f.data
      }));
    }
    const out = await exportAssimp(payloadOf(file), fmt.id);
    return out.map((f, i) => ({
      name: i === 0 ? replaceExt(file.name, fmt.ext) : (f.name.split(/[\\/]/).pop() || f.name),
      data: f.data
    }));
  }
  const packed = await ensureCache(file);
  if (!packed.scene) throw new Error('无法读取场景数据（可尝试导出 GLB / C4D · GLB）');
  const base = file.name.replace(/\.[^.]+$/, '') || 'model';
  return exportById(fmt.id, packed.scene, base);
}

async function exportOne(file, destPath) {
  const files = await buildExport(file);
  if (!files.length) throw new Error('导出结果为空');
  if (api?.writeFile && destPath) {
    if (files.length === 1) {
      await api.writeFile(destPath, files[0].data);
      return destPath;
    }
    const dir = destPath.replace(/[\\/][^\\/]+$/, '');
    await api.writeFiles(dir, files);
    return dir;
  }
  downloadBrowser(files);
  return files[0].name;
}

function downloadBrowser(files) {
  for (const f of files) {
    const blob = new Blob([f.data]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

async function doExport({ pickPath } = {}) {
  const exportable = state.files.filter((f) => !f.blocked);
  if (!exportable.length) {
    toast(MAX_GUIDE, 'error');
    return;
  }
  const fmt = targetFormat();
  try {
    setLoading(true, fmt?.needsBlender ? '正在通过 Blender 导出…' : '正在导出…');
    if (exportable.length === 1) {
      const file = exportable[0];
      let dest = null;
      if (api?.saveFile) {
        dest = await api.saveFile(replaceExt(file.name, fmt.ext), fmt.ext);
        if (!dest) return;
      }
      const path = await exportOne(file, dest);
      toast(`已导出 ${path}`, 'ok');
    } else {
      let dir = null;
      if (api?.saveDir) {
        dir = await api.saveDir();
        if (!dir) return;
        const written = [];
        for (const file of exportable) {
          const files = await buildExport(file);
          await api.writeFiles(dir, files.map((f) => ({ name: f.name, data: f.data })));
          written.push(file.name);
        }
        toast(`已批量导出 ${written.length} 个文件`, 'ok');
      } else {
        for (const file of exportable) {
          downloadBrowser(await buildExport(file));
        }
        toast(`已开始下载 ${exportable.length} 个文件`, 'ok');
      }
    }
  } catch (err) {
    toast(`导出失败：${err.message || err}`, 'error');
  } finally {
    setLoading(false);
  }
}

function bindUi() {
  renderFormats();
  refreshBlenderStatus();
  $('btnOpen').addEventListener('click', openNative);
  $('fileInput').addEventListener('change', (e) => {
    ingestBrowserFiles(e.target.files);
    e.target.value = '';
  });
  $('btnExport').addEventListener('click', () => doExport({ pickPath: true }));
  $('btnExportAs').addEventListener('click', () => doExport({ pickPath: true }));
  $('btnAbout').addEventListener('click', () => showAbout(true));
  $('btnAboutClose').addEventListener('click', () => showAbout(false));
  $('aboutOverlay').addEventListener('click', (e) => {
    if (e.target === $('aboutOverlay')) showAbout(false);
  });
  $('btnSettings')?.addEventListener('click', () => showSettings(true));
  $('btnSettingsClose')?.addEventListener('click', () => showSettings(false));
  $('settingsOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('settingsOverlay')) showSettings(false);
  });
  $('btnPickBlender')?.addEventListener('click', async () => {
    if (!api?.pickBlender) {
      toast('请在桌面应用中选择 Blender 路径', 'error');
      return;
    }
    const result = await api.pickBlender();
    if (!result) return;
    await refreshBlenderStatus();
    toast(result.found ? `已找到 Blender：${result.resolved}` : '所选路径无效', result.found ? 'ok' : 'error');
  });
  $('btnRefreshBlender')?.addEventListener('click', async () => {
    await refreshBlenderStatus();
    toast(state.blender.found ? '已找到 Blender' : '未找到 Blender', state.blender.found ? 'ok' : 'error');
  });
  $('btnMin').addEventListener('click', () => api?.minimize?.());
  $('btnMax').addEventListener('click', () => api?.maximize?.());
  $('btnClose').addEventListener('click', () => api?.close?.());
  $('btnFit').addEventListener('click', () => viewport.fit());
  $('btnGrid').addEventListener('click', () => {
    state.grid = !state.grid;
    viewport.setGrid(state.grid);
    $('btnGrid').classList.toggle('on', state.grid);
  });
  $('btnWire').addEventListener('click', () => {
    state.wire = !state.wire;
    viewport.setWireframe(state.wire);
    $('btnWire').classList.toggle('on', state.wire);
  });
  $('btnSpin').addEventListener('click', () => {
    state.spin = !state.spin;
    viewport.setAutoRotate(state.spin);
    $('btnSpin').classList.toggle('on', state.spin);
  });
  $('btnGrid').classList.add('on');

  api?.onMaximized?.((max) => {
    document.body.classList.toggle('maximized', max);
  });
  api?.onMenu?.('menu:open', openNative);
  api?.onMenu?.('menu:export', () => doExport({ pickPath: true }));
  api?.onMenu?.('menu:about', () => showAbout(true));
  api?.onMenu?.('menu:settings', () => showSettings(true));

  const dropCard = $('dropCard');

  function onDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('dragging');
    dropCard.classList.add('dragover');
  }
  function onDragEnd(e) {
    e.preventDefault();
    document.body.classList.remove('dragging');
    dropCard.classList.remove('dragover');
  }
  ['dragenter', 'dragover'].forEach((ev) => {
    window.addEventListener(ev, onDrag);
  });
  ['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, onDragEnd));
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) ingestBrowserFiles(e.dataTransfer.files);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      showAbout(false);
      showSettings(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openNative();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      doExport({ pickPath: true });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      showSettings(true);
    }
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey) viewport.fit();
  });
}

bindUi();
