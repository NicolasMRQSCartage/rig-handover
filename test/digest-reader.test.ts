import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('digest reader', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps every field of a row, offsets included', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const refresh = rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(rows.find((r) => r.job === 'notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, lastError: null });
  });

  it('returns null for a night with no file or a bad night', () => {
    expect(readNight('runs', '2026-10-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('an empty file is a night with no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    expect(readNight(dir, '2026-10-30')).toEqual({
      night: '2026-10-30',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts lines of the wrong shape as bad, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-10-30.jsonl'),
      ['{"at":"x","job":"a","status":"maybe","owner":"r"}', '[]', 'null', '{"at":"x","job":"a","status":"ok","owner":"r"}'].join('\n'),
    );
    const night = readNight(dir, '2026-10-30')!;
    expect(night.badLines).toBe(3);
    expect(night.rows).toHaveLength(1);
  });
});
