# Meshora

一键转换 · 预览即所得

Windows 桌面 3D 模型转换器。深色界面、实时预览、一键导出。转换不改变模型几何：不做重网格、简化或单位缩放。

## 品牌图标

- `assets/meshora-brand.svg` 是 Meshora 新品牌图标的矢量源文件，UI 中直接使用 SVG。
- Windows 打包前会根据该源文件生成多尺寸 `assets/icon.ico`、应用窗口 PNG 和网页图标，保证安装程序、快捷方式和应用界面保持一致。
- GitHub Actions 会自动安装仅用于构建的图标工具并生成资源；如需本地重新生成，执行：

```bash
npm install --no-save --package-lock=false sharp png-to-ico
npm run icons:generate
```

- 版本 1.1.1
- 作者 / 版权 marsbasex.com
- Copyright © 2026 marsbasex.com

## 功能

- 拖放或文件选择器打开一个或多个模型
- three.js 实时预览：旋转、平移、缩放、适应视图、网格、线框、自动旋转
- 显示文件名、格式、顶点、面、体积大小、材质
- 选择目标格式后一键导出，或「导出到…」
- 多文件批量导出
- **Blender 桥接**：可选本机 Blender CLI，用于预览 `.blend`，以及导出 Cinema 4D 可用的 FBX
- **C4D 互换导出**：`C4D · FBX` / `C4D · GLB` 写出真实的 `.fbx` / `.glb`（不是原生 `.c4d` 工程）

## 导入 / 导出

导入（assimpjs，常见格式）：OBJ、FBX、GLTF、GLB、STL、PLY、DAE、3DS、3MF、OFF、X，以及 assimpjs 能识别的其它格式。USDZ 若当前 WASM 未编译该读取器则会失败。

- **BLEND**：需安装 Blender，并在「设置」中确认已找到。通过 `blender -b … -P scripts/blender_export.py` 转为 GLB 预览。
- **MAX**：无法在无 3ds Max 的环境下直接解析。请先在 3ds Max 导出为 FBX，再导入；界面会明确提示。

导出：

- **C4D · FBX / C4D · GLB**：Cinema 4D 可打开的互换文件（`.fbx` / `.glb`），**不是**原生 `.c4d` Melange 工程。FBX 路径依赖 Blender（任意来源先到 GLB，再由 Blender 导出 FBX；`.blend` 可直接导出 FBX）。
- **GLB / GLTF**：assimpjs 原生写出
- **OBJ / STL / PLY / DAE / 3MF**：按导入后的场景原样写出顶点与面（不重网格）

assimpjs 在导入时会三角化多边形并合并重合顶点（写入 WASM，无法关闭）。顶点坐标不会被缩放或重网格。STL / 3MF 需要三角面，界面会提示。

## 本地运行

需要 Node.js 20+。可选：安装 [Blender](https://www.blender.org) 以支持 `.blend` 与 C4D·FBX。

```bash
npm install
npm run start
```

开发时分别启动渲染进程与 Electron：

```bash
npm run dev
ELECTRON_START_URL=http://localhost:5173 npx electron .
```

示例模型：`samples/cube.obj`

## 打包 Windows 安装包

在 **Windows** 上最稳妥：

```bash
npm run build:win:nsis
```

产物在 `release-build/`，再复制为 `release/Meshora-Setup-1.1.1.exe`。

也可以生成 zip：

```bash
npm run build:win:zip
```

在 Linux 上交叉编译 NSIS 需要 Wine。项目已包含 `.github/workflows/build-windows.yml`：PR 会验证 Windows 安装包；合并到 `main` / `master` 后会再次构建，并在当前 `package.json` 版本号尚无对应 `vX.Y.Z` 标签时自动创建 GitHub Release、上传安装包与 ZIP。版本标签已存在时不会重复发布。`electron-builder` 调用已带 `--publish never`，避免缺少 `GH_TOKEN` 时失败。

安装包配置：

- productName Meshora
- appId com.marsbasex.meshora
- NSIS：oneClick false，允许更改安装目录，桌面与开始菜单快捷方式

## 技术栈

Electron · Vite · three.js · assimpjs ·（可选）Blender CLI

几何预览：先在内存中转为 GLB，再用 GLTFLoader 载入。STL / OBJ / PLY 在转换失败时走 three.js 备用加载器。`.blend` 经 Blender 导出 GLB 后同样预览。
