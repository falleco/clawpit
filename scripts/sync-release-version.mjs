import { readFile, writeFile } from 'node:fs/promises';

async function updatePackageJson(version) {
  const filePath = 'package.json';
  const raw = await readFile(filePath, 'utf8');
  const json = JSON.parse(raw);
  json.version = version;
  await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

async function updateTauriConfig(version) {
  const filePath = 'src-tauri/tauri.conf.json';
  const raw = await readFile(filePath, 'utf8');
  const json = JSON.parse(raw);
  json.version = version;
  await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

async function updateCargoToml(version) {
  const filePath = 'src-tauri/Cargo.toml';
  const raw = await readFile(filePath, 'utf8');

  const updated = raw.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/,
    `$1${version}$3`,
  );

  if (updated === raw) {
    throw new Error('Could not update version in src-tauri/Cargo.toml');
  }

  await writeFile(filePath, updated, 'utf8');
}

async function main() {
  const version = process.argv[2];
  if (!version) {
    throw new Error('Usage: node scripts/sync-release-version.mjs <version>');
  }

  await updatePackageJson(version);
  await updateTauriConfig(version);
  await updateCargoToml(version);

  console.log(`Synchronized release version to ${version}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
