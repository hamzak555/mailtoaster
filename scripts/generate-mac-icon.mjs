import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceImagePath = path.join(projectRoot, 'public', 'logo.jpg');
const buildPath = path.join(projectRoot, 'build');
const iconsetPath = path.join(buildPath, 'icon.iconset');
const outputPath = path.join(buildPath, 'icon.icns');

if (!existsSync(sourceImagePath)) {
  console.error(`Missing source image: ${sourceImagePath}`);
  process.exit(1);
}

mkdirSync(buildPath, { recursive: true });

if (existsSync(outputPath)) {
  console.log(`Using existing icon asset: ${outputPath}`);
  process.exit(0);
}

rmSync(iconsetPath, { recursive: true, force: true });
mkdirSync(iconsetPath, { recursive: true });

const sizes = [16, 32, 128, 256, 512];

for (const size of sizes) {
  for (const scale of [1, 2]) {
    const pixels = size * scale;
    const suffix = scale === 2 ? '@2x' : '';
    const outputFile = path.join(iconsetPath, `icon_${size}x${size}${suffix}.png`);

    execFileSync('sips', ['-s', 'format', 'png', '-z', String(pixels), String(pixels), sourceImagePath, '--out', outputFile], {
      stdio: 'ignore',
    });
  }
}

execFileSync('iconutil', ['-c', 'icns', iconsetPath, '-o', outputPath], {
  stdio: 'ignore',
});
