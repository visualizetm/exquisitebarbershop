import { useState } from 'react';
import { staffListResponseSchema, timeBlockListResponseSchema } from '@shared/api/admin';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { BlockTimeForm } from '../components/BlockTimeForm';
import { TimeBlockItem } from '../components/TimeBlockItem';
import { addDays, shopDateLabel, shopParts, todayInShop } from '../format';

export function BlockTimePage() {
  usePageTitle('Block time');
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const [version, setVersion] = useState(0);
  const from = todayInShop();
  const to = addDays(from, 30);
  const blocks = useApi(
    `/api/admin/time-blocks?from=${from}&to=${to}`,
    timeBlockListResponseSchema,
    {
      version,
    },
  );

  if (staff.status !== 'ready') {
    return (
      <article className="exq-adm-blocktime" data-state={staff.status}>
        <h1 className="exq-adm-blocktime__title">Block time</h1>
        <Status state={staff.status} />
      </article>
    );
  }
  const chairs = staff.data.staff.filter((s) => !s.deletedAt);
  const nameOf = new Map(chairs.map((c) => [c.id, c.name]));
  const upcoming =
    blocks.status === 'ready'
      ? blocks.data.timeBlocks.filter((b) => b.kind === 'block' || b.kind === 'timeOff')
      : [];

  return (
    <article className="exq-adm-blocktime" data-state="ready">
      <h1 className="exq-adm-blocktime__title">Block time</h1>
      <BlockTimeForm
        postPath="/api/admin/time-blocks"
        chairs={chairs}
        onDone={() => {
          setVersion((v) => v + 1);
        }}
      />
      <section className="exq-adm-blocktime__upcoming" aria-labelledby="exq-adm-blocktime-upcoming">
        <h2 id="exq-adm-blocktime-upcoming">Blocked in the next 30 days</h2>
        {blocks.status !== 'ready' ? <Status state={blocks.status} /> : null}
        {blocks.status === 'ready' && upcoming.length === 0 ? <p>Nothing blocked.</p> : null}
        <ul className="exq-adm-blocktime__list">
          {upcoming.map((b) => (
            <li key={b.id} className="exq-adm-blocktime__entry">
              <span className="exq-adm-blocktime__who">
                {nameOf.get(b.staffId) ?? 'Former staff'},{' '}
                {shopDateLabel(shopParts(b.startAt).date)}
              </span>
              <ul>
                <TimeBlockItem
                  block={b}
                  deletePath={`/api/admin/time-blocks/${b.id}`}
                  onChanged={() => {
                    setVersion((v) => v + 1);
                  }}
                />
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
