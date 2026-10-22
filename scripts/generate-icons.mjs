import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'assets', 'meshora-brand.svg');
const assetsDir = path.join(root, 'assets');
const tempDir = path.join(root, '.meshora-icon-build');
const svg = await fs.readFile(sourcePath);

await fs.mkdir(tempDir, { recursive: true });

try {
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
  const outputs = new Map();

  for (const size of sizes) {
    const buffer = await sharp(svg)
      .resize(size, size, { fit: 'contain' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    const tempPath = path.join(tempDir, 'icon-' + size + '.png');
    await fs.writeFile(tempPath, buffer);
    outputs.set(size, { buffer, path: tempPath });
  }

  const ico = await pngToIco([16, 32, 48, 64, 128, 256].map((size) => outputs.get(size).path));
  await fs.writeFile(path.join(assetsDir, 'icon.ico'), ico);

  const pngTargets = [
    ['assets/icon.png', 512],
    ['assets/icon-512.png', 512],
    ['assets/icon-square-1024.png', 1024],
    ['assets/icon-source.png', 1024],
    ['src/icon.png', 512],
    ['public/icon.png', 512]
  ];

  for (const [relativePath, size] of pngTargets) {
    await fs.writeFile(path.join(root, relativePath), outputs.get(size).buffer);
  }

  console.log('Generated Meshora brand icons: ICO 16–256px, PNG 512px and 1024px.');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
