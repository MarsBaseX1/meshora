const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

app.setName('Meshora');
app.setAppUserModelId('com.marsbasex.meshora');

let mainWindow = null;

function configPath() {
  return path.join(app.getPath('userData'), 'meshora-config.json');
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(partial) {
  const next = { ...readConfig(), ...partial };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function blenderScriptPath() {
  const candidates = [
    path.join(__dirname, '..', 'scripts', 'blender_export.py'),
    path.join(process.resourcesPath || '', 'scripts', 'blender_export.py'),
    path.join(app.getAppPath(), 'scripts', 'blender_export.py')
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}

function looksLikeBlenderExe(filePath) {
  if (!filePath) return false;
  try {
    if (!fs.existsSync(filePath)) return false;
    const base = path.basename(filePath).toLowerCase();
    if (process.platform === 'win32') {
      return base === 'blender.exe';
    }
    return base === 'blender' || base.startsWith('blender');
  } catch {
    return false;
  }
}

function commonBlenderCandidates() {
  const list = [];
  if (process.platform === 'win32') {
    const roots = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA
    ].filter(Boolean);
    for (const root of roots) {
      const foundation = path.join(root, 'Blender Foundation');
      try {
        if (!fs.existsSync(foundation)) continue;
        for (const name of fs.readdirSync(foundation)) {
          list.push(path.join(foundation, name, 'blender.exe'));
        }
      } catch {
        /* ignore */
      }
    }
    list.push('C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe');
    list.push('C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe');
    list.push('C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe');
    list.push('C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe');
  } else {
    list.push('/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender');
    list.push('/Applications/Blender.app/Contents/MacOS/Blender');
  }
  return list;
}

async function whichBlender() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const child = spawn(cmd, ['blender'], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', () => {
      const first = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      resolve(first || null);
    });
    child.on('error', () => resolve(null));
  });
}

async function resolveBlenderPath(preferred) {
  const cfg = readConfig();
  const candidates = [
    preferred,
    cfg.blenderPath,
    await whichBlender(),
    ...commonBlenderCandidates()
  ].filter(Boolean);

  for (const c of candidates) {
    if (looksLikeBlenderExe(c)) return c;
  }
  return null;
}

function runProcess(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      env: process.env,
      ...opts
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve({ code, stdout, stderr });
      else {
        const err = new Error(
          `Blender 退出码 ${code}${stderr ? `：${stderr.slice(-800)}` : ''}`
        );
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

async function blenderConvert({ inputPath, inputData, inputName, format, outputPath }) {
  const blender = await resolveBlenderPath();
  if (!blender) {
    const err = new Error('未找到 Blender。请在设置中指定 blender.exe，或安装后加入 PATH。');
    err.code = 'BLENDER_NOT_FOUND';
    throw err;
  }
  const script = blenderScriptPath();
  if (!fs.existsSync(script)) {
    throw new Error(`找不到 Blender 脚本：${script}`);
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meshora-blend-'));
  let inPath = inputPath;
  try {
    if (!inPath) {
      const name = inputName || `input.${format === 'fbx' ? 'glb' : 'blend'}`;
      inPath = path.join(tmpRoot, path.basename(name));
      fs.writeFileSync(inPath, Buffer.from(inputData));
    }
    const ext = (format || 'glb').replace(/^\./, '');
    const outPath = outputPath || path.join(tmpRoot, `out.${ext}`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // Always pass --in so the script controls import (works for blend/glb/fbx).
    const args = ['-b', '-P', script, '--', '--in', inPath, '--out', outPath, '--format', ext];
    await runProcess(blender, args);

    if (!fs.existsSync(outPath)) {
      throw new Error('Blender 未写出目标文件');
    }
    const buf = fs.readFileSync(outPath);
    return {
      ok: true,
      path: outPath,
      data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      size: buf.length,
      blender
    };
  } finally {
    // Keep output if caller asked for a specific path outside tmp; clean tmp inputs.
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    frame: false,
    transparent: false,
    backgroundColor: '#0B0C0F',
    title: 'Meshora',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('win:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('win:maximized', false);
  });

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    mainWindow.loadURL(startUrl);
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexHtml);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open')
        },
        {
          label: '导出…',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export')
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '设置…',
          click: () => mainWindow?.webContents.send('menu:settings')
        },
        {
          label: '关于 Meshora',
          click: () => mainWindow?.webContents.send('menu:about')
        },
        {
          label: 'marsbasex.com',
          click: () => shell.openExternal('https://marsbasex.com')
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

const IMPORT_FILTERS = [
  {
    name: '3D 模型',
    extensions: [
      'obj', 'fbx', 'gltf', 'glb', 'stl', 'ply', 'dae', '3ds', '3mf', 'off', 'x',
      'usdz', 'usd', 'usda', 'usdc', 'blend', 'max', 'x3d', 'bvh', 'lwo', 'lws', 'md2',
      'md3', 'md5mesh', 'smd', 'ase', 'ifc', 'dxf', 'pmx', 'b3d', 'ms3d', 'nff',
      'raw', 'ter', 'ac', 'irrmesh', 'mdl', 'hmp', 'ndo', 'q3o', 'q3s', 'ogex'
    ]
  },
  { name: 'Blender', extensions: ['blend'] },
  { name: '3ds Max（需先导出 FBX）', extensions: ['max', 'fbx'] },
  { name: '所有文件', extensions: ['*'] }
];

ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开模型',
    properties: ['openFile', 'multiSelections'],
    filters: IMPORT_FILTERS
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths.map((filePath) => {
    const buf = fs.readFileSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: buf.length,
      data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    };
  });
});

ipcMain.handle('dialog:saveFile', async (_evt, defaultName, ext) => {
  const filters = ext
    ? [{ name: ext.toUpperCase(), extensions: [ext.replace(/^\./, '')] }]
    : [{ name: '所有文件', extensions: ['*'] }];
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出到…',
    defaultPath: defaultName || 'model',
    filters
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle('dialog:saveDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择导出文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pickBlender', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Blender 可执行文件',
    properties: ['openFile'],
    filters:
      process.platform === 'win32'
        ? [
            { name: 'Blender', extensions: ['exe'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        : [{ name: '所有文件', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const picked = result.filePaths[0];
  writeConfig({ blenderPath: picked });
  const resolved = await resolveBlenderPath(picked);
  return {
    path: picked,
    found: Boolean(resolved),
    resolved
  };
});

ipcMain.handle('fs:writeFile', async (_evt, filePath, data) => {
  const buf = Buffer.from(data);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  return { ok: true, path: filePath, size: buf.length };
});

ipcMain.handle('fs:writeFiles', async (_evt, dir, files) => {
  const written = [];
  for (const file of files) {
    const dest = path.join(dir, file.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = Buffer.from(file.data);
    fs.writeFileSync(dest, buf);
    written.push(dest);
  }
  return { ok: true, files: written };
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  name: app.getName(),
  packaged: app.isPackaged,
  platform: process.platform
}));

ipcMain.handle('blender:status', async () => {
  const cfg = readConfig();
  const resolved = await resolveBlenderPath();
  return {
    found: Boolean(resolved),
    path: resolved,
    configuredPath: cfg.blenderPath || null,
    script: blenderScriptPath(),
    statusText: resolved ? '已找到' : '未找到'
  };
});

ipcMain.handle('blender:setPath', async (_evt, blenderPath) => {
  writeConfig({ blenderPath: blenderPath || '' });
  const resolved = await resolveBlenderPath(blenderPath || null);
  return {
    found: Boolean(resolved),
    path: resolved,
    configuredPath: blenderPath || null,
    statusText: resolved ? '已找到' : '未找到'
  };
});

ipcMain.handle('blender:convert', async (_evt, payload) => {
  return blenderConvert(payload || {});
});
