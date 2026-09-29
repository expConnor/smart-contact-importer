import type { ReactNode } from 'react';

type PanelProps = {
  title: string;
  // Beside the title, right-aligned: a status or a count.
  aside?: ReactNode;
  // Under the title, small and muted.
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
};

// A box with a tinted title strip on top. The body is the caller's.
export function Panel({
  title,
  aside,
  description,
  className,
  children,
}: PanelProps) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      <div className="panel-head">
        <div className="panel-title-row">
          <h2 className="heading">{title}</h2>
          {aside}
        </div>
        {description && (
          <p className="muted panel-description">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
