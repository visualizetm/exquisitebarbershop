import type { ReactNode } from 'react';

/** The red caps eyebrow above a heading. */
export function Label({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  return <p className={`exq-label${quiet ? ' exq-label--quiet' : ''}`}>{children}</p>;
}

/** An eyebrow plus its heading, so sections open the same way everywhere. */
export function SectionHead({
  label,
  title,
  id,
  level = 2,
  children,
}: {
  label: ReactNode;
  title: ReactNode;
  id?: string;
  level?: 1 | 2;
  /** Anything on the right of the heading, such as a link. */
  children?: ReactNode;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="exq-sectionhead">
      <div className="exq-sectionhead__text">
        <Label>{label}</Label>
        <Heading id={id}>{title}</Heading>
      </div>
      {children ? <div className="exq-sectionhead__aside">{children}</div> : null}
    </div>
  );
}
