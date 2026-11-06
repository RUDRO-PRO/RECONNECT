// Uses the same tracing engine as Vercel, without deploying or reading secrets.
const { nodeFileTrace } = require('@vercel/nft');
const picomatch = require('picomatch');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8'));
  const excluded = picomatch(config.functions['api/index.js'].excludeFiles, { dot: true });
  const trace = await nodeFileTrace(['api/index.js'], {
    base: root,
    processCwd: root,
    // Vercel installs only root dependencies. Hide local backend installs so
    // this check resolves exactly that dependency layout without moving files.
    stat: async file => {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (relative === 'backend/node_modules' || relative.startsWith('backend/node_modules/')) return null;
      try { return await fs.stat(file); } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
        throw error;
      }
    },
    ignore: file => excluded(file.replaceAll('\\', '/')),
  });
  const files = await Promise.all([...trace.fileList].map(async file => ({
    file: file.replaceAll('\\', '/'),
    bytes: (await fs.stat(path.join(root, file))).size,
  })));
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`api/index.js: ${files.length} traced files, ${(bytes / 1024 / 1024).toFixed(2)} MiB uncompressed (${bytes} bytes).`);
  console.log('Largest traced files:');
  files.sort((a, b) => b.bytes - a.bytes).slice(0, 8).forEach(file => console.log(`${file.bytes} ${file.file}`));
  // Optional MongoDB integrations and debug's optional terminal-color detection.
  const optional = ['kerberos', 'mongodb-client-encryption', 'snappy', 'socks', '@aws-sdk/credential-providers', '@mongodb-js/zstd', 'supports-color'];
  const unexpected = [...trace.warnings].filter(warning => !optional.some(name => String(warning).includes(`dependency "${name}"`)));
  if (unexpected.length) throw new Error(unexpected.map(String).join('\n'));
  if (files.some(file => excluded(file.file))) throw new Error('Excluded file entered function trace.');
  // Leave ample room for Vercel runtime helpers and platform-specific differences.
  if (bytes > 50 * 1024 * 1024) throw new Error('Function trace exceeds the 50 MiB project budget.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
