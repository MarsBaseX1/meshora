import createAssimp from 'assimpjs';
import wasmUrl from 'assimpjs/dist/assimpjs.wasm?url';
import { collectStats } from './exporters.js';

let worker = null;
let seq = 0;
const pending = new Map();
let mainAssimp = null;

function copyContent(content) {
  const src = content instanceof Uint8Array ? content : new Uint8Array(content);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy;
}

async function getMainAssimp() {
  if (!mainAssimp) {
    mainAssimp = createAssimp({
      locateFile: (file) => (file && file.endsWith('.wasm') ? wasmUrl : file)
    });
  }
  return mainAssimp;
}

function ensureWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./converter.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const { id, files, error } = ev.data || {};
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      if (error) job.reject(new Error(error));
      else job.resolve((files || []).map((f) => ({ name: f.name, data: new Uint8Array(f.data) })));
    };
    worker.onerror = (err) => {
      console.warn('converter worker error, falling back', err);
      for (const job of pending.values()) job.reject(err);
      pending.clear();
      worker = null;
    };
  } catch (err) {
    worker = null;
  }
  return worker;
}

async function convertOnMain(files, format) {
  const ajs = await getMainAssimp();
  const fileList = new ajs.FileList();
  for (const f of files) {
    const bytes = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    fileList.AddFile(f.name || 'model', bytes);
  }
  const result = ajs.ConvertFileList(fileList, format);
  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(result.GetErrorCode() || 'IMPORT_ERROR');
  }
  const out = [];
  for (let i = 0; i < result.FileCount(); i++) {
    const file = result.GetFile(i);
    out.push({
      name: file.GetPath ? file.GetPath() : `result_${i}`,
      data: copyContent(file.GetContent())
    });
  }
  return out;
}

export async function convertFiles(files, format = 'glb2') {
  const w = ensureWorker();
  if (w) {
    const id = ++seq;
    try {
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const transfer = [];
        const payload = files.map((f) => {
          const bytes = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
          const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          transfer.push(buf);
          return { name: f.name, data: buf };
        });
        w.postMessage({ id, files: payload, format }, transfer);
      });
    } catch (err) {
      return convertOnMain(files, format);
    }
  }
  return convertOnMain(files, format);
}

export async function importScene(files) {
  const glbPack = await convertFiles(files, 'glb2');
  const jsonPack = await convertFiles(files, 'assjson');
  const glb = glbPack[0];
  const jsonFile = jsonPack[0];
  let scene = null;
  if (jsonFile) {
    const text = new TextDecoder().decode(jsonFile.data);
    scene = JSON.parse(text);
  }
  const stats = scene ? collectStats(scene) : { vertices: 0, faces: 0, materials: [], meshCount: 0, materialCount: 0 };
  return { glb, extras: glbPack.slice(1), scene, stats, jsonFile };
}

export async function exportAssimp(files, formatId) {
  return convertFiles(files, formatId);
}
