import { Viewport } from './viewport.js';
import { importScene, exportAssimp } from './converter.js';
import { exportById } from './exporters.js';
import {
  EXPORT_FORMATS,
  extOf,
  formatLabel,
  formatSize,
  isPrimaryModel,
  replaceExt,
  COMPANION_EXTENSIONS
} from './formats.js';

const api = window.meshora;
const $ = (id) => document.getElementById(id);

const state = {
  files: [], // { id, name, size, data, companions: [], record }
  activeId: null,
  cache: new Map(), // id -> { glb, scene, stats, previewStats }
  target: 'glb2',
  grid: true,
  wire: false,
  spin: false
};

const viewport = new Viewport($('view'));
let fileSeq = 0;

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'ok' ? 'ok' : ''}`;
  el.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function setLoading(on, text) {
  $('loadingVeil').hidden = !on;
  if (text) $('loadingText').textContent = text;
}

function showAbout(on) {
  $('aboutOverlay').hidden = !on;
}

function current() {
  return state.files.find((f) => f.id === state.activeId) || null;
}

function renderFormats() {
  const grid = $('formatGrid');
  grid.innerHTML = '';
  for (const fmt of EXPORT_FORMATS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `fmt${state.target === fmt.id ? ' active' : ''}`;
    btn.textContent = fmt.label;
    btn.title = fmt.name;
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
}

function renderFiles() {
  $('fileCount').textContent = String(state.files.length);
  const list = $('fileList');
  list.innerHTML = '';
  for (const file of state.files) {
    const row = document.createElement('div');
    row.className = `file-item${file.id === state.activeId ? ' active' : ''}`;
    row.innerHTML = `
      <span class="chip">${formatLabel(file.name)}</span>
      <div class="file-meta">
        <div class="file-name"></div>
        <div class="file-sub">${formatSize(file.size)}</div>
      </div>
      <button class="file-x" type="button" title="移除">×</button>
    `;
    row.querySelector('.file-name').textContent = file.name;
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
  const has = state.files.length > 0;
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
  try {
    setLoading(true, '正在解析并生成预览…');
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

async function ensureCache(file) {
  if (state.cache.has(file.id)) return state.cache.get(file.id);
  const result = await importScene(payloadOf(file));
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
    const rec = {
      id: `f${++fileSeq}`,
      name: item.name,
      size: item.size ?? item.data.byteLength,
      data: item.data instanceof Uint8Array ? item.data : new Uint8Array(item.data),
      companions: companions.map((c) => ({ name: c.name, data: c.data }))
    };
    state.files.push(rec);
    added.push(rec);
  }
  renderFiles();
  if (added[0]) selectFile(added[0].id);
}

async function openNative() {
  if (api?.openFiles) {
    try {
      const list = await api.openFiles();
      if (list && list.length) {
        ingestNamed(list.map((f) => ({
          name: f.name,
          size: f.size,
          data: new Uint8Array(f.data)
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

async function buildExport(file) {
  const fmt = targetFormat();
  const base = file.name.replace(/\.[^.]+$/, '') || 'model';
  if (fmt.via === 'assimpjs') {
    const out = await exportAssimp(payloadOf(file), fmt.id);
    return out.map((f, i) => ({
      name: i === 0 ? replaceExt(file.name, fmt.ext) : (f.name.split(/[\\/]/).pop() || f.name),
      data: f.data
    }));
  }
  const packed = await ensureCache(file);
  if (!packed.scene) throw new Error('无法读取场景数据');
  const files = await exportById(fmt.id, packed.scene, base);
  return files;
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
  if (!state.files.length) return;
  const fmt = targetFormat();
  try {
    setLoading(true, '正在导出…');
    if (state.files.length === 1) {
      const file = state.files[0];
      let dest = null;
      if (pickPath && api?.saveFile) {
        dest = await api.saveFile(replaceExt(file.name, fmt.ext), fmt.ext);
        if (!dest) return;
      } else if (api?.saveFile) {
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
        for (const file of state.files) {
          const files = await buildExport(file);
          const mapped = files.map((f) => ({
            name: f.name,
            data: f.data
          }));
          await api.writeFiles(dir, mapped);
          written.push(file.name);
        }
        toast(`已批量导出 ${written.length} 个文件`, 'ok');
      } else {
        for (const file of state.files) {
          const files = await buildExport(file);
          downloadBrowser(files);
        }
        toast(`已开始下载 ${state.files.length} 个文件`, 'ok');
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

  const frame = $('viewportFrame');
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
    if (e.key === 'Escape') showAbout(false);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openNative();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      doExport({ pickPath: true });
    }
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey) viewport.fit();
  });
}

bindUi();
