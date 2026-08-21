const fs = require('fs');
const path = require('path');
const assimpjs = require('assimpjs')();

(async () => {
  const ajs = await assimpjs;
  const fileList = new ajs.FileList();
  fileList.AddFile('cube.obj', fs.readFileSync(path.join(__dirname, '..', 'samples', 'cube.obj')));
  fileList.AddFile('cube.mtl', fs.readFileSync(path.join(__dirname, '..', 'samples', 'cube.mtl')));
  for (const fmt of ['glb2', 'gltf2', 'assjson']) {
    const result = ajs.ConvertFileList(fileList, fmt);
    if (!result.IsSuccess() || result.FileCount() === 0) {
      console.error('FAIL', fmt, result.GetErrorCode());
      process.exit(1);
    }
    console.log('OK', fmt, 'files', result.FileCount(), 'first', result.GetFile(0).GetPath(), 'bytes', result.GetFile(0).GetContent().length);
  }
  // probe extra formats
  for (const fmt of ['obj', 'stl', 'stlb', 'ply', 'collada', 'fbx', '3mf', 'dae', 'x']) {
    const result = ajs.ConvertFileList(fileList, fmt);
    console.log('probe', fmt, result.IsSuccess(), result.IsSuccess() ? result.FileCount() : result.GetErrorCode());
  }
  if (process.argv.includes('--json')) {
    const result = ajs.ConvertFileList(fileList, 'assjson');
    const json = JSON.parse(new TextDecoder().decode(result.GetFile(0).GetContent()));
    console.log('meshes', json.meshes?.length, 'verts', json.meshes?.[0]?.vertices?.length / 3, 'faces', json.meshes?.[0]?.faces?.length);
    fs.writeFileSync('/tmp/cube-assjson.json', JSON.stringify(json, null, 2).slice(0, 4000));
  }
  console.log('convert-smoke-ok');
})().catch((e) => { console.error(e); process.exit(1); });
