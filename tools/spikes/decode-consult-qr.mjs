import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/agent-web/package.json', import.meta.url));
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const png = PNG.sync.read(readFileSync(process.argv[2]));
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
if (!decoded) throw new Error('downloaded consultation QR cannot be decoded');
process.stdout.write(JSON.stringify({ url: decoded.data, width: png.width, height: png.height }));
