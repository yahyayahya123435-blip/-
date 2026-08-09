// Copies the custom-output Prisma Client (generated/prisma, see
// prisma/schema.prisma's generator block) into electron/dist so compiled
// code's relative `require('../../generated/prisma')` resolves the same way
// it does against the TypeScript source. tsc only compiles .ts files, so it
// never copies this generated JS/native-binary directory on its own.
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const source = path.join(projectRoot, 'generated');
const dest = path.join(projectRoot, 'electron', 'dist', 'generated');

if (!fs.existsSync(source)) {
  console.error(`[copy-generated-prisma] ${source} does not exist — run "npx prisma generate" first.`);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(source, dest, { recursive: true });
console.log(`[copy-generated-prisma] copied ${source} -> ${dest}`);
