const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.setName('Meshora');
app.setAppUserModelId('com.marsbasex.meshora');

let mainWindow = null;

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
      'usdz', 'usd', 'usda', 'usdc', 'blend', 'x3d', 'bvh', 'lwo', 'lws', 'md2',
      'md3', 'md5mesh', 'smd', 'ase', 'ifc', 'dxf', 'pmx', 'b3d', 'ms3d', 'nff',
      'raw', 'ter', 'ac', 'irrmesh', 'mdl', 'hmp', 'ndo', 'q3o', 'q3s', 'ogex'
    ]
  },
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
