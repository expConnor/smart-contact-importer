import type { ReactNode } from 'react';

// The one look for "this failed": red text after a ✕, announced to screen
// readers as it appears.
export function ErrorMessage({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={className ? `error ${className}` : 'error'} role="alert">
      ✕ {children}
    </p>
  );
}
