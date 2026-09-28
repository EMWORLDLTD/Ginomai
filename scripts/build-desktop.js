// Ginomia - Desktop Build Script
// Builds Windows NSIS installer and portable executable cleanly without workspace file-locking conflicts.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const tempBuildDir = path.join(os.tmpdir(), 'ginomai-desktop-build');
const installersDir = path.join(projectRoot, 'installers');

const shouldPublish = process.argv.includes('--publish');

console.log('====================================================');
console.log(' Ginomia — Windows Desktop App Builder');
console.log('====================================================');
console.log(`Project root:      ${projectRoot}`);
console.log(`Build staging dir: ${tempBuildDir}`);
console.log(`Final output dir:  ${installersDir}`);
console.log(`Publish to GitHub: ${shouldPublish ? 'YES (Releases)' : 'NO (Local Only)'}`);
console.log('----------------------------------------------------');

if (!fs.existsSync(installersDir)) {
  fs.mkdirSync(installersDir, { recursive: true });
}

// Normalize path with forward slashes for electron-builder config
const safeBuildPath = tempBuildDir.replace(/\\/g, '/');

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const args = [
  'electron-builder',
  '--win',
  `--config.directories.output=${safeBuildPath}`
];

if (shouldPublish) {
  args.push('--publish', 'always');
}

console.log(`Executing: ${npxCmd} ${args.join(' ')}\n`);

const builder = spawn(npxCmd, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: process.env
});

builder.on('close', (code) => {
  if (code !== 0) {
    console.error(`\n⨯ Build failed with exit code ${code}`);
    process.exit(code);
  }

  console.log('\n✔ Packaging complete! Copying installer executables to ./installers ...');

  try {
    const files = fs.readdirSync(tempBuildDir);
    let copiedCount = 0;

    for (const file of files) {
      if (file.endsWith('.exe') || file.endsWith('.blockmap') || file.endsWith('.yml')) {
        const src = path.join(tempBuildDir, file);
        const dest = path.join(installersDir, file);
        fs.copyFileSync(src, dest);
        const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
        console.log(`  -> Copied ${file} (${sizeMb} MB)`);
        copiedCount++;
      }
    }

    console.log(`\n====================================================`);
    console.log(`✔ SUCCESS! ${copiedCount} build artifacts available in:`);
    console.log(`  ${installersDir}`);
    if (shouldPublish) {
      console.log(`✔ Released to GitHub: https://github.com/EMWORLDLTD/ginomai-pro/releases`);
    }
    console.log(`====================================================\n`);
  } catch (err) {
    console.error('⨯ Error copying output files:', err);
    process.exit(1);
  }
});
