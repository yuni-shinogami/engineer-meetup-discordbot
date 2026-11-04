import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { join } from 'path';

const ROOT = join(__dirname, '../..');

// import の決まり（.dependency-cruiser.cjs）を npm test でも検査する。
// 今ある違反は .dependency-cruiser-known-violations.json に控えてあり、新しく増えたときだけ落ちる。
describe('依存の決まり', () => {
  it('新しい違反が無い', () => {
    const result = spawnSync(
      process.execPath,
      [
        join(ROOT, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'),
        'src',
        '--config', '.dependency-cruiser.cjs',
        '--ignore-known',
        '--output-type', 'err',
      ],
      { cwd: ROOT, encoding: 'utf-8' },
    );
    // 落ちたときは、どの import が決まりに反したかをそのまま見せる
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 60_000);
});
