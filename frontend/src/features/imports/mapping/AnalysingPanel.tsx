import { Panel } from '@/shared/ui/Panel';
import './mapping.css';

// Column name and sample widths, in px: uneven, so it reads as data.
const ROWS = [
  [72, 180],
  [96, 136],
  [56, 208],
  [88, 152],
  [64, 116],
];

// Where the mapping review will be, shaped like it: the same headers, and
// bars for the columns the worker hasn't read yet.
export function AnalysingPanel() {
  return (
    <Panel
      className="mapping"
      title="Analysing"
      description={
        <>
          The worker decodes the file, finds the delimiter and header row, and
          proposes a mapping. The review appears here when the job reaches{' '}
          <span className="mono">AWAITING_MAPPING</span>.
        </>
      }
    >
      <div className="table-scroll" aria-hidden>
        <table className="table">
          <thead>
            <tr>
              <th>Column in file</th>
              <th>Sample values</th>
              <th>Import as</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([name, samples], i) => {
              // Each row trails the one above: the sweep runs down the table.
              const style = { animationDelay: `${i * 0.12}s` };
              return (
                <tr key={i}>
                  <td>
                    <span
                      className="skeleton"
                      style={{ ...style, width: name, height: 10 }}
                    />
                  </td>
                  <td>
                    <span
                      className="skeleton"
                      style={{ ...style, width: samples, height: 10 }}
                    />
                  </td>
                  <td>
                    <span
                      className="skeleton mapping-skeleton-select"
                      style={style}
                    />
                  </td>
                  <td>
                    <span
                      className="skeleton"
                      style={{ ...style, width: 48, height: 10 }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mapping-footer" aria-hidden>
        <span className="skeleton mapping-skeleton-note" />
        <span className="skeleton mapping-skeleton-button" />
      </div>
    </Panel>
  );
}
