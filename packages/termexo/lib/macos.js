import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const vendorRoot = fileURLToPath(new URL('../vendor/', import.meta.url));

/** Extract the matching complete app once, preserving its signature, modes and symlinks. */
export function prepareMacApplication({
  version,
  arch = process.arch,
  archivePath,
  cacheRoot = join(homedir(), 'Library', 'Caches', 'Termexo', 'npm'),
  extract = (archive, destination) =>
    execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', destination]),
}) {
  if (!['arm64', 'x64'].includes(arch))
    throw new Error(`Unsupported macOS architecture: ${arch}`);
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Invalid Termexo package version');
  const archive =
    archivePath ?? join(vendorRoot, `darwin-${arch}`, 'Termexo.app.tar.gz');
  const digest = createHash('sha256')
    .update(readFileSync(archive))
    .digest('hex');
  const destination = join(
    cacheRoot,
    `${version}-${arch}-${digest.slice(0, 16)}`,
  );
  const application = join(destination, 'Termexo.app');
  const complete = () =>
    existsSync(join(application, 'Contents', 'MacOS', 'termexo')) &&
    existsSync(join(application, 'Contents', 'Info.plist'));
  if (complete()) return application;
  mkdirSync(cacheRoot, { recursive: true });
  const temporary = mkdtempSync(join(cacheRoot, '.extract-'));
  try {
    extract(archive, temporary);
    const app = join(temporary, 'Termexo.app', 'Contents');
    if (
      !existsSync(join(app, 'MacOS', 'termexo')) ||
      !existsSync(join(app, 'Info.plist'))
    ) {
      throw new Error(
        'The npm archive does not contain a complete Termexo.app',
      );
    }
    try {
      renameSync(temporary, destination);
    } catch (error) {
      // Another npx process may finish extracting this same package first.
      if (!complete()) throw error;
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return application;
}
