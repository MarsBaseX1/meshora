# Meshora

一键转换 · 预览即所得

Windows 桌面 3D 模型转换器。深色界面、实时预览、一键导出。转换不改变模型几何：不做重网格、简化或单位缩放。

- 版本 1.0.0
- 作者 / 版权 marsbasex.com
- Copyright © 2026 marsbasex.com

## 功能

- 拖放或文件选择器打开一个或多个模型
- three.js 实时预览：旋转、平移、缩放、适应视图、网格、线框、自动旋转
- 显示文件名、格式、顶点、面、体积大小、材质
- 选择目标格式后一键导出，或「导出到…」
- 多文件批量导出

## 导入 / 导出

导入（assimpjs，常见格式）：OBJ、FBX、GLTF、GLB、STL、PLY、DAE、3DS、3MF、OFF、X，以及 assimpjs 能识别的其它格式。USDZ 若当前 WASM 未编译该读取器则会失败。

导出：

- **GLB / GLTF**：assimpjs 原生写出
- **OBJ / STL / PLY / DAE / 3MF**：按导入后的场景原样写出顶点与面（不重网格）
- **FBX**：assimpjs 0.0.10 未开放该导出器，界面中已隐藏

assimpjs 在导入时会三角化多边形并合并重合顶点（写入 WASM，无法关闭）。顶点坐标不会被缩放或重网格。STL / 3MF 需要三角面，界面会提示。

## 本地运行

需要 Node.js 20+。

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

产物在 `release-build/`，再复制为 `release/Meshora-Setup-1.0.0.exe`。

也可以生成 zip：

```bash
npm run build:win:zip
```

在 Linux 上交叉编译 NSIS 需要 Wine。项目已包含 `.github/workflows/build-windows.yml`，推送或打 tag 后由 `windows-latest` 生成安装包。

安装包配置：

- productName Meshora
- appId com.marsbasex.meshora
- NSIS：oneClick false，允许更改安装目录，桌面与开始菜单快捷方式

## 技术栈

Electron · Vite · three.js · assimpjs

几何预览：先在内存中转为 GLB，再用 GLTFLoader 载入。STL / OBJ / PLY 在转换失败时走 three.js 备用加载器。
