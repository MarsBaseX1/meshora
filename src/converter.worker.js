import createAssimp from 'assimpjs';
import wasmUrl from 'assimpjs/dist/assimpjs.wasm?url';

let ajsPromise = null;

function getAssimp() {
  if (!ajsPromise) {
    ajsPromise = createAssimp({
      locateFile: (file) => (file && file.endsWith('.wasm') ? wasmUrl : file)
    });
  }
  return ajsPromise;
}

function copyContent(content) {
  const src = content instanceof Uint8Array ? content : new Uint8Array(content);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy;
}

self.onmessage = async (event) => {
  const { id, files, format } = event.data || {};
  try {
    const ajs = await getAssimp();
    const fileList = new ajs.FileList();
    for (const f of files || []) {
      const name = f.name || 'model';
      const bytes = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      fileList.AddFile(name, bytes);
    }
    const result = ajs.ConvertFileList(fileList, format || 'glb2');
    if (!result.IsSuccess() || result.FileCount() === 0) {
      self.postMessage({ id, error: result.GetErrorCode() || 'IMPORT_ERROR' });
      return;
    }
    const out = [];
    for (let i = 0; i < result.FileCount(); i++) {
      const file = result.GetFile(i);
      const path = file.GetPath ? file.GetPath() : `result_${i}`;
      const content = copyContent(file.GetContent());
      out.push({ name: path, data: content.buffer });
    }
    self.postMessage({ id, files: out }, out.map((f) => f.data));
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  }
};
