import { useState } from 'react';
import { staffListResponseSchema } from '@shared/api/admin';
import { Chip, Chips, EmptyState, Select } from '@/components/ui';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { PhotoManager } from '../components/PhotoManager';
import { useMe } from '../useSession';

type Tab = 'hero' | 'staff' | 'gallery';

/** Hero, chair portraits and gallery photos, each managed with the same uploader. */
export function PhotosPage() {
  usePageTitle('Photos');
  const me = useMe();
  // Without photo storage (STORAGE_DRIVER=none) nothing is listed; the staff list is not needed.
  const staff = useApi(me.features.photos ? '/api/admin/staff' : null, staffListResponseSchema);
  const [tab, setTab] = useState<Tab>('hero');
  const [chair, setChair] = useState('');
  const chairs = staff.status === 'ready' ? staff.data.staff.filter((s) => !s.deletedAt) : [];
  const chairId = chair !== '' ? chair : (chairs[0]?.id ?? '');

  if (!me.features.photos) {
    return (
      <article className="exq-adm-photos-page" data-state="disabled">
        <h1>Photos</h1>
        <EmptyState title="Photo storage isn't set up yet.">
          Photos can be added once it's connected.
        </EmptyState>
      </article>
    );
  }

  return (
    <article className="exq-adm-photos-page" data-state={tab}>
      <h1>Photos</h1>
      <Chips label="Photo kinds">
        {(
          [
            ['hero', 'Hero'],
            ['staff', 'Chairs'],
            ['gallery', 'Gallery'],
          ] as const
        ).map(([key, label]) => (
          <Chip
            key={key}
            selected={tab === key}
            onClick={() => {
              setTab(key);
            }}
          >
            {label}
          </Chip>
        ))}
      </Chips>
      {tab === 'hero' ? (
        <>
          <p className="exq-muted">
            The home page hero. The first photo in the list is the one shown; it looks best wide,
            with the subject off centre so the words fit over it.
          </p>
          <PhotoManager kind="hero" title="Hero photos" />
        </>
      ) : null}
      {tab !== 'hero' ? (
        staff.status !== 'ready' ? (
          <Status state={staff.status === 'error' ? 'error' : 'loading'} />
        ) : (
          <>
            <Select
              label={tab === 'staff' ? 'Chair' : 'Credit the work to'}
              value={tab === 'staff' ? chairId : chair}
              onChange={(e) => {
                setChair(e.target.value);
              }}
            >
              {tab === 'gallery' ? <option value="">Nobody in particular</option> : null}
              {chairs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {tab === 'staff' ? (
              <>
                <p className="exq-muted">
                  The first photo is the portrait shown on the site. Portraits look best taller than
                  wide.
                </p>
                <PhotoManager key={chairId} kind="staff" staffId={chairId} title="Chair photos" />
              </>
            ) : (
              <PhotoManager
                key={chair || 'all'}
                kind="gallery"
                staffId={chair || undefined}
                title="Gallery photos"
              />
            )}
          </>
        )
      ) : null}
    </article>
  );
}
