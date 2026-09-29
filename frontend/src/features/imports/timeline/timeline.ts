import type { ImportJob, ImportStatus } from '../api';

// What moves the job (the link) and the status it lands in (the node).
// Link i lands on node i.
export const STEPS: {
  actor: string;
  trigger: string;
  tip: string;
  status: ImportStatus;
}[] = [
  {
    actor: 'request',
    trigger: 'POST /imports',
    tip: 'Stores the file, inserts the row, returns 201 at once. Same Idempotency-Key again → 200, same id.',
    status: 'PENDING_ANALYSIS',
  },
  {
    actor: 'worker',
    trigger: 'claim',
    tip: 'UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED): one worker wins, under a lease.',
    status: 'ANALYZING',
  },
  {
    actor: 'worker',
    trigger: 'settle',
    tip: 'Conditional UPDATE: only the lease holder can write findings. Lease cleared, attempts reset.',
    status: 'AWAITING_MAPPING',
  },
  {
    actor: 'you',
    trigger: 'POST /mapping',
    tip: 'Mapping validated against stored headers → 202. 422 if it does not fit, 409 if already confirmed.',
    status: 'PENDING_IMPORT',
  },
  {
    actor: 'worker',
    trigger: 'claim',
    tip: 'Claimed again under a fresh lease.',
    status: 'IMPORTING',
  },
  {
    actor: 'worker',
    trigger: 'settle',
    tip: 'Counts and completedAt written in one UPDATE that checks leaseOwner and leaseExpiresAt.',
    status: 'COMPLETED',
  },
];

export type Phase = 'analysis' | 'review' | 'import' | 'done';

// Brackets over the 12 cells, left to right. Cell 2i is link i, cell 2i + 1
// is node i.
export const PHASES: { phase: Phase; label: string; span: number }[] = [
  { phase: 'analysis', label: '1 · analysis', span: 5 },
  { phase: 'review', label: '2 · review', span: 2 },
  { phase: 'import', label: '3 · import', span: 4 },
  { phase: 'done', label: 'done', span: 1 },
];

export type NodeLook = 'past' | 'current' | 'future' | 'failed';

type JobState = Pick<ImportJob, 'status' | 'proposedMapping'>;

// The node the job sits on. FAILED isn't a node: a mapping means analysis
// had settled, so the import is what failed.
function nodeOf(job: JobState): number {
  if (job.status === 'FAILED') return job.proposedMapping ? 4 : 1;
  return STEPS.findIndex((step) => step.status === job.status);
}

export function nodeLooks(job: JobState): NodeLook[] {
  const at = nodeOf(job);
  const here = job.status === 'FAILED' ? 'failed' : 'current';
  return STEPS.map((_, i) => (i < at ? 'past' : i === at ? here : 'future'));
}

export function phaseOf(job: JobState): Phase {
  const cell = 2 * nodeOf(job) + 1;
  let end = 0;
  for (const { phase, span } of PHASES) {
    end += span;
    if (cell < end) return phase;
  }
  throw new Error(`No phase for cell ${cell}`);
}
