// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once it has parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the log's offset (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—"
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` for this job, even if a later run was ok
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; the page and the JSON use this order as is
  counts: Record<RunStatus, number>; // lines per status, for the board
  badLines: number; // lines that didn't parse: counted, never thrown
};

// null when the night has no file (or isn't a YYYY-MM-DD night): the routes answer 404.
// An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
