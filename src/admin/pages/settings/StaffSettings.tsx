import { useCallback, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  conflictOnlyResponseSchema,
  hoursResponseSchema,
  serviceListResponseSchema,
  staffListResponseSchema,
  staffMutationResponseSchema,
  staffResponseSchema,
  type AdminServiceView,
  type AdminStaffView,
  type ConflictResolution,
} from '@shared/api/admin';
import type { WeekHours } from '@shared/schemas/common';
import { slugify } from '@shared/lib/slug';
import { Status } from '@/components/Status';
import { Button, Sheet } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ConflictResolver } from '../../components/ConflictResolver';
import { PhotoManager } from '../../components/PhotoManager';
import { ErrorNote } from '../../components/ErrorNote';
import { WeekHoursEditor } from '../../components/WeekHoursEditor';
import { useConflictAction } from '../../useConflictAction';

type Role = AdminStaffView['role'];

interface StaffDraft {
  name: string;
  role: Role;
  title: string;
  specialty: string;
  bio: string;
  chairNumber: string;
  serviceIds: string[];
  instagramHandle: string;
  photoUrl: string;
  sortOrder: string;
  acceptsOnlineBooking: boolean;
  showOnWebsite: boolean;
}

const EMPTY: StaffDraft = {
  name: '',
  role: 'barber',
  title: 'Barber',
  specialty: '',
  bio: '',
  chairNumber: '',
  serviceIds: [],
  instagramHandle: '',
  photoUrl: '',
  sortOrder: '100',
  acceptsOnlineBooking: true,
  showOnWebsite: true,
};

function draftOf(s: AdminStaffView): StaffDraft {
  return {
    name: s.name,
    role: s.role,
    title: s.title,
    specialty: s.specialty,
    bio: s.bio,
    chairNumber: s.chairNumber === null ? '' : String(s.chairNumber),
    serviceIds: s.serviceIds,
    instagramHandle: s.instagramHandle ?? '',
    photoUrl: s.photoUrl ?? '',
    sortOrder: String(s.sortOrder),
    acceptsOnlineBooking: s.acceptsOnlineBooking,
    showOnWebsite: s.showOnWebsite,
  };
}

function bodyOf(d: StaffDraft) {
  return {
    name: d.name.trim(),
    role: d.role,
    title: d.title.trim(),
    specialty: d.specialty.trim(),
    bio: d.bio.trim(),
    chairNumber: d.chairNumber.trim() === '' ? null : Number(d.chairNumber),
    serviceIds: d.serviceIds,
    instagramHandle:
      d.instagramHandle.trim() === '' ? null : d.instagramHandle.trim().replace(/^@/, ''),
    photoUrl: d.photoUrl.trim() === '' ? null : d.photoUrl.trim(),
    sortOrder: Number(d.sortOrder),
    acceptsOnlineBooking: d.acceptsOnlineBooking,
    showOnWebsite: d.showOnWebsite,
  };
}

export function StaffSettings() {
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const staff = useApi('/api/admin/staff', staffListResponseSchema, { version });
  const services = useApi('/api/admin/services', serviceListResponseSchema);
  const hours = useApi('/api/admin/hours', hoursResponseSchema, { version });
  const refresh = () => {
    setVersion((v) => v + 1);
  };

  if (staff.status !== 'ready' || services.status !== 'ready' || hours.status !== 'ready') {
    const failed = [staff, services, hours].some((s) => s.status === 'error');
    return (
      <section className="exq-adm-staff" data-state={failed ? 'error' : 'loading'}>
        <h2>Staff</h2>
        <Status state={failed ? 'error' : 'loading'} />
      </section>
    );
  }
  const live = services.data.services.filter((s) => !s.deletedAt);

  return (
    <section className="exq-adm-staff" data-state="ready" aria-labelledby="exq-adm-staff-title">
      <h2 id="exq-adm-staff-title">Staff</h2>
      <p>
        <Button
          size="sm"
          onClick={() => {
            setCreating(true);
          }}
        >
          Add a staff member
        </Button>
      </p>
      <Sheet
        open={creating}
        title="Add a staff member"
        size="lg"
        onClose={() => {
          setCreating(false);
        }}
      >
        <CreateStaff
          services={live}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      </Sheet>
      <ul className="exq-adm-staff__list">
        {staff.data.staff.map((s) => (
          <StaffRow
            key={`${s.id}-${String(version)}`}
            staff={s}
            services={live}
            hours={hours.data.staff.find((h) => h.staffId === s.id)?.days ?? hours.data.shop}
            onChanged={refresh}
          />
        ))}
      </ul>
    </section>
  );
}

function CreateStaff({
  services,
  onCreated,
}: {
  services: AdminServiceView[];
  onCreated: () => void;
}) {
  const [slug, setSlug] = useState('');
  return (
    <StaffForm
      idPrefix="new"
      initial={EMPTY}
      services={services}
      submitLabel="Add staff member"
      extra={
        <p>
          <label htmlFor="exq-adm-staff-new-slug">
            Web address name (used in /chairs/ and QR codes)
          </label>{' '}
          <input
            id="exq-adm-staff-new-slug"
            required
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
            }}
          />
        </p>
      }
      onSubmit={async (d) => {
        await apiRequest('/api/admin/staff', staffResponseSchema, {
          method: 'POST',
          body: { ...bodyOf(d), slug: slug || slugify(d.name) },
        });
        setSlug('');
        onCreated();
      }}
    />
  );
}

function StaffRow({
  staff,
  services,
  hours,
  onChanged,
}: {
  staff: AdminStaffView;
  services: AdminServiceView[];
  hours: WeekHours;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const deleted = staff.deletedAt !== null;
  return (
    <li className="exq-adm-staff__item" data-state={deleted ? 'deleted' : 'active'}>
      <span className="exq-adm-staff__name">
        <strong>{staff.name}</strong>
        <span className="exq-muted">
          {' '}
          {staff.title}
          {staff.chairNumber !== null ? `, chair ${String(staff.chairNumber)}` : ''}
          {deleted ? ', removed' : ''}
          {staff.hasLogin ? ', has a login' : ''}
        </span>
      </span>
      {deleted ? null : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true);
          }}
        >
          Edit
        </Button>
      )}
      <Sheet
        open={open}
        title={staff.name}
        size="lg"
        onClose={() => {
          setOpen(false);
        }}
      >
        <EditStaff staff={staff} services={services} onChanged={onChanged} />
        <section className="exq-adm-staff__photos" aria-label="Photos">
          <h3>Photos</h3>
          <p className="exq-muted">The first photo is the portrait on the site.</p>
          <PhotoManager kind="staff" staffId={staff.id} title={`Photos of ${staff.name}`} />
        </section>
        <SlugForm staff={staff} onChanged={onChanged} />
        <StaffHours staff={staff} hours={hours} onChanged={onChanged} />
        <RemoveStaff staff={staff} onChanged={onChanged} />
      </Sheet>
    </li>
  );
}

function EditStaff({
  staff,
  services,
  onChanged,
}: {
  staff: AdminStaffView;
  services: AdminServiceView[];
  onChanged: () => void;
}) {
  const send = useCallback(
    (d: StaffDraft, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${staff.id}`, staffMutationResponseSchema, {
        method: 'PATCH',
        body: { ...bodyOf(d), ...(resolutions ? { resolutions } : {}) },
      }),
    [staff.id],
  );
  const action = useConflictAction(send);
  return (
    <>
      <StaffForm
        idPrefix={staff.id}
        initial={draftOf(staff)}
        services={services}
        submitLabel="Save changes"
        onSubmit={async (d) => {
          if (await action.run(d)) onChanged();
        }}
      />
      {action.state.status === 'conflict' ? (
        <ConflictResolver
          affected={action.state.affected}
          working={false}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) onChanged();
            });
          }}
          onCancel={action.reset}
        />
      ) : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
    </>
  );
}

function SlugForm({ staff, onChanged }: { staff: AdminStaffView; onChanged: () => void }) {
  const [slug, setSlug] = useState(staff.slug);
  const [error, setError] = useState<unknown>(null);
  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiRequest(`/api/admin/staff/${staff.id}/slug`, staffResponseSchema, {
        method: 'POST',
        body: { slug },
      });
      onChanged();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <form className="exq-adm-staff__slug" onSubmit={(e) => void submit(e)}>
      <h3>Web address</h3>
      <p>
        Now /chairs/{staff.slug}.{' '}
        {staff.slugAliases.length > 0
          ? `Old addresses that still work: ${staff.slugAliases.join(', ')}.`
          : ''}{' '}
        Renaming keeps the old address working forever, so printed QR codes never break.
      </p>
      <label htmlFor={`exq-adm-staff-slug-${staff.id}`}>New web address name</label>{' '}
      <input
        id={`exq-adm-staff-slug-${staff.id}`}
        required
        value={slug}
        onChange={(e) => {
          setSlug(slugify(e.target.value));
        }}
      />{' '}
      <button type="submit" disabled={slug === staff.slug}>
        Rename
      </button>
      <ErrorNote error={error} />
    </form>
  );
}

function StaffHours({
  staff,
  hours,
  onChanged,
}: {
  staff: AdminStaffView;
  hours: WeekHours;
  onChanged: () => void;
}) {
  const [days, setDays] = useState(hours);
  const send = useCallback(
    (value: WeekHours, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${staff.id}/hours`, conflictOnlyResponseSchema, {
        method: 'PUT',
        body: { days: value, ...(resolutions ? { resolutions } : {}) },
      }),
    [staff.id],
  );
  const action = useConflictAction(send);
  return (
    <form
      className="exq-adm-staff__hours"
      data-state={action.state.status}
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(days).then((ok) => {
          if (ok) onChanged();
        });
      }}
    >
      <h3>Weekly hours</h3>
      <p>These are limited by the shop hours.</p>
      <WeekHoursEditor
        idPrefix={`exq-adm-staff-hours-${staff.id}`}
        value={days}
        onChange={setDays}
      />
      <button type="submit" disabled={action.state.status === 'working'}>
        Save hours
      </button>
      {action.state.status === 'conflict' ? (
        <ConflictResolver
          affected={action.state.affected}
          working={false}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) onChanged();
            });
          }}
          onCancel={action.reset}
        />
      ) : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
    </form>
  );
}

function RemoveStaff({ staff, onChanged }: { staff: AdminStaffView; onChanged: () => void }) {
  const send = useCallback(
    (_r: null, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${staff.id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: resolutions ? { resolutions } : {},
      }),
    [staff.id],
  );
  const action = useConflictAction(send);
  return (
    <div className="exq-adm-staff__remove" data-state={action.state.status}>
      <h3>Remove</h3>
      <p>Removing hides this person from the site and booking and turns off their login.</p>
      <button
        type="button"
        disabled={action.state.status === 'working'}
        onClick={() => {
          void action.run(null).then((ok) => {
            if (ok) onChanged();
          });
        }}
      >
        Remove {staff.name}
      </button>
      {action.state.status === 'conflict' ? (
        <ConflictResolver
          affected={action.state.affected}
          working={false}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) onChanged();
            });
          }}
          onCancel={action.reset}
        />
      ) : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
    </div>
  );
}

function StaffForm({
  idPrefix,
  initial,
  services,
  submitLabel,
  extra,
  onSubmit,
}: {
  idPrefix: string;
  initial: StaffDraft;
  services: AdminServiceView[];
  submitLabel: string;
  extra?: React.ReactNode;
  onSubmit: (draft: StaffDraft) => Promise<void>;
}) {
  const [d, setD] = useState(initial);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const id = (field: string) => `exq-adm-staff-${idPrefix}-${field}`;
  function set<K extends keyof StaffDraft>(key: K, value: StaffDraft[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }
  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await onSubmit(d);
      if (idPrefix === 'new') setD(initial);
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }
  return (
    <form
      className="exq-adm-staff-form"
      data-state={working ? 'working' : 'idle'}
      onSubmit={(e) => void submit(e)}
    >
      <p>
        <label htmlFor={id('name')}>Name</label>{' '}
        <input
          id={id('name')}
          required
          maxLength={80}
          value={d.name}
          onChange={(e) => {
            set('name', e.target.value);
          }}
        />
      </p>
      {extra}
      <p>
        <label htmlFor={id('role')}>Role</label>{' '}
        <select
          id={id('role')}
          value={d.role}
          onChange={(e) => {
            const value = e.target.value;
            set('role', value === 'owner' || value === 'stylist' ? value : 'barber');
          }}
        >
          <option value="barber">Barber</option>
          <option value="stylist">Stylist</option>
          <option value="owner">Owner</option>
        </select>{' '}
        <label htmlFor={id('title')}>Title</label>{' '}
        <input
          id={id('title')}
          required
          maxLength={80}
          value={d.title}
          onChange={(e) => {
            set('title', e.target.value);
          }}
        />
      </p>
      <p>
        <label htmlFor={id('specialty')}>Specialty</label>{' '}
        <input
          id={id('specialty')}
          maxLength={200}
          value={d.specialty}
          onChange={(e) => {
            set('specialty', e.target.value);
          }}
        />
      </p>
      <p>
        <label htmlFor={id('bio')}>Bio</label>{' '}
        <textarea
          id={id('bio')}
          maxLength={2000}
          rows={3}
          value={d.bio}
          onChange={(e) => {
            set('bio', e.target.value);
          }}
        />
      </p>
      <p>
        <label htmlFor={id('chair')}>Chair number</label>{' '}
        <input
          id={id('chair')}
          type="number"
          min={1}
          max={99}
          value={d.chairNumber}
          onChange={(e) => {
            set('chairNumber', e.target.value);
          }}
        />{' '}
        <label htmlFor={id('sort')}>Order</label>{' '}
        <input
          id={id('sort')}
          type="number"
          min={0}
          value={d.sortOrder}
          onChange={(e) => {
            set('sortOrder', e.target.value);
          }}
        />
      </p>
      <p>
        <label htmlFor={id('ig')}>Instagram</label>{' '}
        <input
          id={id('ig')}
          value={d.instagramHandle}
          onChange={(e) => {
            set('instagramHandle', e.target.value);
          }}
        />{' '}
        <label htmlFor={id('photo')}>Photo URL</label>{' '}
        <input
          id={id('photo')}
          type="url"
          value={d.photoUrl}
          onChange={(e) => {
            set('photoUrl', e.target.value);
          }}
        />
      </p>
      <fieldset>
        <legend>Services offered</legend>
        {services.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={d.serviceIds.includes(s.id)}
              onChange={(e) => {
                set(
                  'serviceIds',
                  e.target.checked
                    ? [...d.serviceIds, s.id]
                    : d.serviceIds.filter((x) => x !== s.id),
                );
              }}
            />{' '}
            {s.name}
          </label>
        ))}
      </fieldset>
      <p>
        <label>
          <input
            type="checkbox"
            checked={d.acceptsOnlineBooking}
            onChange={(e) => {
              set('acceptsOnlineBooking', e.target.checked);
            }}
          />{' '}
          Takes online bookings
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={d.showOnWebsite}
            onChange={(e) => {
              set('showOnWebsite', e.target.checked);
            }}
          />{' '}
          Shown on the website
        </label>
      </p>
      <ErrorNote error={error} />
      <button type="submit" disabled={working}>
        {submitLabel}
      </button>
    </form>
  );
}
