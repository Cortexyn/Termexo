import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareMacApplication } from '../lib/macos.js';

function fixture(t, complete = true) {
  const root = mkdtempSync(join(tmpdir(), 'termexo-npm-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const contents = join(root, 'source', 'Termexo.app', 'Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  writeFileSync(join(contents, 'Info.plist'), '<plist/>');
  if (complete)
    writeFileSync(join(contents, 'MacOS', 'termexo'), '#!/bin/sh\nexit 0\n', {
      mode: 0o755,
    });
  const archivePath = join(root, 'Termexo.app.tar.gz');
  execFileSync('tar', [
    '-czf',
    archivePath,
    '-C',
    join(root, 'source'),
    'Termexo.app',
  ]);
  return {
    version: '0.11.0',
    arch: 'arm64',
    archivePath,
    cacheRoot: join(root, 'cache with spaces'),
    extract: (archive, destination) =>
      execFileSync('tar', ['-xzf', archive, '-C', destination]),
  };
}

test('extracts a complete app and reuses it without extracting again', (t) => {
  const options = fixture(t);
  const app = prepareMacApplication(options);
  assert.ok(existsSync(join(app, 'Contents', 'MacOS', 'termexo')));
  assert.equal(
    prepareMacApplication({
      ...options,
      extract() {
        assert.fail('Cache should be reused');
      },
    }),
    app,
  );
  assert.ok(
    !readdirSync(options.cacheRoot).some((name) =>
      name.startsWith('.extract-'),
    ),
  );
});

test('isolates architecture and archive content in cache entries', (t) => {
  const options = fixture(t);
  const arm = prepareMacApplication(options);
  const intel = prepareMacApplication({ ...options, arch: 'x64' });
  assert.notEqual(arm, intel);
  writeFileSync(
    options.archivePath,
    Buffer.concat([Buffer.from([0]), Buffer.from('changed archive')]),
  );
  assert.throws(() => prepareMacApplication(options));
  assert.ok(existsSync(join(arm, 'Contents', 'Info.plist')));
});

test('rejects incomplete apps and cleans temporary extraction files', (t) => {
  const options = fixture(t, false);
  assert.throws(() => prepareMacApplication(options), /complete Termexo.app/);
  assert.deepEqual(readdirSync(options.cacheRoot), []);
});

test('rejects unsupported architectures and invalid version paths before extraction', () => {
  assert.throws(
    () => prepareMacApplication({ version: '0.11.0', arch: 'ia32' }),
    /Unsupported macOS/,
  );
  assert.throws(
    () => prepareMacApplication({ version: '../invalid', arch: 'arm64' }),
    /Invalid Termexo/,
  );
});
