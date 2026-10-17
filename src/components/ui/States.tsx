import type { ReactNode } from 'react';

/** Nothing here yet, said kindly, with a way forward. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="exq-state" data-tone="empty" data-state="empty">
      <p className="exq-state__title exq-h">{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** Something failed. Always offers a retry or a way out. */
export function ErrorState({
  title = 'Something went wrong',
  children,
  action,
}: {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="exq-state" data-tone="error" data-state="error" role="alert">
      <p className="exq-state__title exq-h">{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
