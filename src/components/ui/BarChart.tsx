import { useId, useState } from 'react';

export interface BarGroup {
  label: string;
  /** The first series (this week). */
  a: number;
  /** The second series (last week). */
  b: number;
  /** Marks the group as today: its label is drawn bold and ends with a dot. */
  current?: boolean;
}

const W = 640;
const H = 240;
const PAD = { top: 16, right: 8, bottom: 32, left: 32 };

/**
 * Grouped bars drawn by hand in SVG, no chart library. Series A is ink, series B is the line
 * color. Every number is also in a real table for screen readers; hovering or focusing a group
 * shows its values. The y axis is whole numbers only.
 */
export function BarChart({
  title,
  groups,
  nameA,
  nameB,
}: {
  title: string;
  groups: BarGroup[];
  nameA: string;
  nameB: string;
}) {
  const id = useId();
  const [hot, setHot] = useState<number | null>(null);
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, groups.length);
  const barW = Math.min(22, slot / 3);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top];

  return (
    <figure className="exq-chart" data-state="ready">
      <figcaption className="exq-chart__title">{title}</figcaption>
      <ul className="exq-chart__legend exq-bare" aria-hidden="true">
        <li>
          <span className="exq-chart__swatch" data-series="a" />
          {nameA}
        </li>
        <li>
          <span className="exq-chart__swatch" data-series="b" />
          {nameB}
        </li>
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t`}
        className="exq-chart__svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <title
          id={`${id}-t`}
        >{`${title}. ${groups.map((g) => `${g.label}: ${g.a} this week, ${g.b} last week`).join('; ')}.`}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="exq-chart__grid"
            />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="exq-chart__tick">
              {Number.isInteger(t) ? t : ''}
            </text>
          </g>
        ))}
        {groups.map((g, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g
              key={g.label}
              data-state={hot === i ? 'hot' : 'idle'}
              aria-hidden="true"
              onMouseEnter={() => {
                setHot(i);
              }}
              onMouseLeave={() => {
                setHot(null);
              }}
            >
              <rect
                x={cx - slot / 2}
                y={PAD.top}
                width={slot}
                height={plotH}
                className="exq-chart__hit"
              />
              <rect
                x={cx - barW - 1}
                y={y(g.a)}
                width={barW}
                height={plotH - (y(g.a) - PAD.top)}
                className="exq-chart__bar"
                data-series="a"
              />
              <rect
                x={cx + 1}
                y={y(g.b)}
                width={barW}
                height={plotH - (y(g.b) - PAD.top)}
                className="exq-chart__bar"
                data-series="b"
              />
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                className="exq-chart__label"
                data-current={g.current ? 'true' : 'false'}
              >
                {g.current ? `${g.label} (today)` : g.label}
              </text>
              {hot === i ? (
                <text
                  x={cx}
                  y={Math.max(12, y(Math.max(g.a, g.b)) - 6)}
                  textAnchor="middle"
                  className="exq-chart__value"
                >
                  {g.a} / {g.b}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <table className="exq-visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{nameA}</th>
            <th scope="col">{nameB}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}>
              <th scope="row">{g.current ? `${g.label} (today)` : g.label}</th>
              <td>{g.a}</td>
              <td>{g.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
