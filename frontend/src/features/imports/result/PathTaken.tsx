import type { InferenceFallback, InferenceSource } from '../api';
import { fallbackLine, pathTaken, type PathStep } from './result';

type Node = {
  id: PathStep;
  x: number;
  y: number;
  w: number;
  title: string;
  // The mapping node shows the job's source instead.
  subtitle?: string;
};

type Edge = {
  id: PathStep;
  d: string;
  dashed?: boolean;
  // Centre of a pill that sits on the line.
  label?: { text: string; x: number; y: number; w: number };
};

const NODE_HEIGHT = 52;

// Three rows: Claude's path on top, the built-in rules below, the file and
// the mapping between them. Elbows are rounded with an 8px quadratic.
const NODES: Node[] = [
  {
    id: 'sniff',
    x: 4,
    y: 68,
    w: 124,
    title: 'Sniff file',
    subtitle: 'headers, samples',
  },
  {
    id: 'guess',
    x: 160,
    y: 16,
    w: 136,
    title: 'Claude guess',
    subtitle: 'if API key set',
  },
  {
    id: 'validate',
    x: 328,
    y: 16,
    w: 136,
    title: 'Validate',
    subtitle: 'fits the headers',
  },
  {
    id: 'rules',
    x: 160,
    y: 120,
    w: 304,
    title: 'Built-in rules',
    subtitle: 'names, keywords, value shapes',
  },
  { id: 'mapping', x: 512, y: 68, w: 120, title: 'Mapping' },
];

const EDGES: Edge[] = [
  { id: 'sniff-guess', d: 'M66 68 V50 Q66 42 74 42 H158' },
  {
    id: 'sniff-rules',
    d: 'M66 120 V138 Q66 146 74 146 H158',
    label: { text: 'no key', x: 114, y: 146, w: 50 },
  },
  { id: 'guess-validate', d: 'M296 42 H326' },
  {
    id: 'guess-rules',
    d: 'M228 68 V118',
    dashed: true,
    label: { text: 'error', x: 228, y: 93, w: 44 },
  },
  {
    id: 'validate-rules',
    d: 'M396 68 V118',
    dashed: true,
    label: { text: 'rejected', x: 396, y: 93, w: 62 },
  },
  {
    id: 'validate-mapping',
    d: 'M464 42 H480 Q488 42 488 50 V78 Q488 86 496 86 H510',
  },
  {
    id: 'rules-mapping',
    d: 'M464 146 H480 Q488 146 488 138 V110 Q488 102 496 102 H510',
  },
];

// How the column mapping was chosen, with the steps this job took lit up.
export function PathTaken({
  source,
  fallback,
}: {
  source: InferenceSource | null;
  fallback: InferenceFallback | null;
}) {
  const lit = new Set(pathTaken(source, fallback));
  const caption = fallbackLine(source, fallback);

  return (
    <section className="result-card">
      <header className="result-card-head">
        <h3 className="label">Path taken</h3>
        {fallback && (
          <span className="result-card-chip mono">fallback: {fallback}</span>
        )}
      </header>

      <div className="path-canvas">
        {/* Hidden from screen readers: the caption below says the same in words. */}
        <svg viewBox="0 0 636 188" aria-hidden className="path-svg">
          <defs>
            {/* context-stroke: the head takes its edge's colour. */}
            <marker
              id="path-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M2 1.5 L8 5 L2 8.5"
                fill="none"
                stroke="context-stroke"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          {EDGES.map((edge) => (
            <g
              key={edge.id}
              className="path-edge"
              data-lit={lit.has(edge.id) || undefined}
            >
              <path
                d={edge.d}
                fill="none"
                strokeDasharray={edge.dashed ? '3 3' : undefined}
                markerEnd="url(#path-arrow)"
              />
              {edge.label && (
                <g className="path-pill">
                  <rect
                    x={edge.label.x - edge.label.w / 2}
                    y={edge.label.y - 8}
                    width={edge.label.w}
                    height="16"
                    rx="8"
                  />
                  <text
                    x={edge.label.x}
                    y={edge.label.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {edge.label.text}
                  </text>
                </g>
              )}
            </g>
          ))}

          {NODES.map((node) => (
            <g
              key={node.id}
              className="path-node"
              data-lit={lit.has(node.id) || undefined}
            >
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={NODE_HEIGHT}
                rx="8"
              />
              {/* Status dot: filled with a halo when lit, a ring when not. */}
              <circle
                className="path-halo"
                cx={node.x + 16}
                cy={node.y + 19}
                r="6.5"
              />
              <circle
                className="path-dot"
                cx={node.x + 16}
                cy={node.y + 19}
                r="3.5"
              />
              <text
                className="path-title"
                x={node.x + 28}
                y={node.y + 19}
                dominantBaseline="central"
              >
                {node.title}
              </text>
              <text
                className={
                  node.subtitle ? 'path-subtitle' : 'path-subtitle mono'
                }
                x={node.x + 28}
                y={node.y + 36}
                dominantBaseline="central"
              >
                {node.subtitle ?? source ?? '—'}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <p className="result-card-foot">{caption}</p>
    </section>
  );
}
