#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function main() {
  const src = resolve(root, 'backend/out/Counter.sol/Counter.json');
  const dst = resolve(root, 'app/counter-abi.json');
  try {
    const raw = await readFile(src, 'utf-8');
    const json = JSON.parse(raw);
    if (!json.abi) throw new Error('No abi field in Counter.json');
    const abi = JSON.stringify(json.abi, null, 2) + '\n';
    await writeFile(dst, abi, 'utf-8');
    console.log(`ABI synced -> ${dst}`);
  } catch (err) {
    console.error('Failed to sync ABI:', err?.message || err);
    process.exitCode = 1;
  }
}

main();
