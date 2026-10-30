import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow } from '../src/digest/types.js';

// Temp runs dir: our own .jsonl fixtures, never the repo's runs/.
let runsDir: string;

const config = (dir: string): RigConfig => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: dir,
});

const line = (job: string, status: 'ok' | 'retry' | 'fail', at: string) =>
  JSON.stringify({ at, job, status, owner: 'rook' });

const GOOD = '2026-10-30';
const BAD = '2026-10-29';
const EMPTY = '2026-10-31';
const MISSING = '2026-10-01';

// Jobs written out of order on purpose: the route must sort them.
const GOOD_JOBS = ['digest/render', 'lane/sync', 'rook/sweep'];

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(
    join(runsDir, `${GOOD}.jsonl`),
    [
      line('rook/sweep', 'ok', '2026-10-30T23:00:02+01:00'),
      line('lane/sync', 'retry', '2026-10-30T23:00:04+01:00'),
      line('digest/render', 'ok', '2026-10-30T23:00:06+01:00'),
      line('lane/sync', 'ok', '2026-10-30T23:05:00+01:00'),
      line('rook/sweep', 'fail', '2026-10-30T23:10:00+01:00'),
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [
      line('digest/render', 'ok', '2026-10-29T23:00:02+01:00'),
      '{"at":"2026-10-29T23:00:04+01:00","job":"lane/sy',
      line('rook/sweep', 'ok', '2026-10-29T23:00:06+01:00'),
      '',
    ].join('\n'),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

type DigestBody = { night: string; rows: DigestRow[]; badLines: number };

async function page(night: string) {
  return createApp(config(runsDir)).request(`/digest/${night}`);
}

async function json(night: string) {
  return createApp(config(runsDir)).request(`/api/digest/${night}`);
}

describe('GET /digest/:night (page)', () => {
  it('200 for a night with lines, with every job name', async () => {
    const res = await page(GOOD);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of GOOD_JOBS) expect(html).toContain(job);
  });

  it('404 for a night with no file', async () => {
    const res = await page(MISSING);
    expect(res.status).toBe(404);
  });

  it('the empty night says "nothing ran"', async () => {
    const res = await page(EMPTY);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('a bad line does not hide the good jobs', async () => {
    const res = await page(BAD);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('digest/render');
    expect(html).toContain('rook/sweep');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 with one row per job, sorted by job, no bad lines', async () => {
    const res = await json(GOOD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestBody;
    expect(body.rows.map((r) => r.job)).toEqual([...GOOD_JOBS].sort());
    expect(body.badLines).toBe(0);
  });

  it('404 with the error body for a night with no file', async () => {
    const res = await json(MISSING);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: MISSING });
  });

  it('the empty night is 200 with no rows', async () => {
    const res = await json(EMPTY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestBody;
    expect(body.rows).toEqual([]);
  });

  it('a bad line is counted, the good jobs are still there', async () => {
    const res = await json(BAD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestBody;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'rook/sweep']);
  });
});

describe('page and JSON agree', () => {
  it.each([GOOD, BAD])('%s: job names appear in the page in the JSON row order', async (night) => {
    const html = await (await page(night)).text();
    const body = (await (await json(night)).json()) as DigestBody;
    const jobs = body.rows.map((r) => r.job);
    for (const job of jobs) expect(html.indexOf(job)).toBeGreaterThan(-1);
    const inPageOrder = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(inPageOrder).toEqual(jobs);
  });
});
