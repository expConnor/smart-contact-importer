import { Fragment, useId } from 'react';
import type { ImportJob } from '../api';
import { nodeLooks, PHASES, phaseOf, STEPS } from './timeline';
import './timeline.css';

// Links (what moved the job) and nodes (where it landed), under phase
// brackets.
export function JobTimeline({ job }: { job: ImportJob }) {
  const tipId = useId();
  const looks = nodeLooks(job);
  const phase = phaseOf(job);
  // The link after the current node is what the job waits on. COMPLETED is
  // the last node, so nothing follows it.
  const current = looks.indexOf('current');

  return (
    <div className="timeline-scroll">
      <div className="timeline">
        {PHASES.map((p) => (
          <div
            key={p.phase}
            className="tl-phase mono"
            data-current={p.phase === phase || undefined}
            data-lone={p.span === 1 || undefined}
            style={{ gridColumn: `span ${p.span}` }}
          >
            {p.label}
          </div>
        ))}

        {STEPS.map((step, i) => {
          const look = looks[i];
          return (
            <Fragment key={step.status}>
              <div
                className="tl-link"
                data-dark={look !== 'future' || undefined}
                data-next={(current !== -1 && i === current + 1) || undefined}
                data-actor={step.actor}
                data-edge={
                  i === 0 ? 'start' : i === STEPS.length - 1 ? 'end' : undefined
                }
                style={{ gridColumn: 2 * i + 1 }}
                tabIndex={0}
                aria-describedby={`${tipId}-${i}`}
              >
                <div className="tl-above">
                  <span className="tl-actor">{step.actor}</span>
                  <span className="mono tl-trigger">{step.trigger}</span>
                </div>
                <div className="tl-track" />
                <span className="tip" role="tooltip" id={`${tipId}-${i}`}>
                  {step.tip}
                </span>
              </div>
              <div
                className="tl-node"
                data-look={look}
                data-status={step.status}
                style={{ gridColumn: 2 * i + 2 }}
              >
                <div />
                <div className="tl-track">
                  <span className="tl-dot" />
                </div>
                <div className="tl-below">
                  {/* Long names break after an underscore on narrow screens. */}
                  <span className="mono tl-name">
                    {step.status.split('_').map((word, w) => (
                      <Fragment key={w}>
                        {w > 0 && (
                          <>
                            _<wbr />
                          </>
                        )}
                        {word}
                      </Fragment>
                    ))}
                  </span>
                  {look === 'current' && (
                    <span className="mono tl-pill">
                      {job.status === 'COMPLETED' ? 'done' : 'now'}
                    </span>
                  )}
                  {look === 'failed' && (
                    <span className="mono tl-pill">✕ failed</span>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
