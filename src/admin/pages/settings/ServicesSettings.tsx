import { useCallback, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  conflictOnlyResponseSchema,
  serviceListResponseSchema,
  serviceResponseSchema,
  type AdminServiceView,
  type ConflictResolution,
} from '@shared/api/admin';
import { parseDollarsToCents } from '@shared/lib/money';
import { Button, Input, Select, Sheet, Textarea, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ConflictResolver } from '../../components/ConflictResolver';
import { ErrorNote } from '../../components/ErrorNote';
import { money } from '../../format';
import { useConflictAction } from '../../useConflictAction';

interface ServiceDraft {
  name: string;
  group: 'Barber' | 'Beauty';
  description: string;
  price: string;
  priceFrom: boolean;
  durationMinutes: string;
  bufferMinutes: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY: ServiceDraft = {
  name: '',
  group: 'Barber',
  description: '',
  price: '',
  priceFrom: false,
  durationMinutes: '30',
  bufferMinutes: '',
  sortOrder: '100',
  isActive: true,
};

function draftOf(s: AdminServiceView): ServiceDraft {
  return {
    name: s.name,
    group: s.group,
    description: s.description,
    price: (s.priceCents / 100).toFixed(2),
    priceFrom: s.priceFrom,
    durationMinutes: String(s.durationMinutes),
    bufferMinutes: s.bufferMinutes === null ? '' : String(s.bufferMinutes),
    sortOrder: String(s.sortOrder),
    isActive: s.isActive,
  };
}

/** Converts the form to the API shape. Bad numbers go to the server as-is so its validation explains them. */
function bodyOf(d: ServiceDraft) {
  return {
    name: d.name.trim(),
    group: d.group,
    description: d.description.trim(),
    priceCents: parseDollarsToCents(d.price) ?? Number.NaN,
    priceFrom: d.priceFrom,
    durationMinutes: Number(d.durationMinutes),
    bufferMinutes: d.bufferMinutes.trim() === '' ? null : Number(d.bufferMinutes),
    sortOrder: Number(d.sortOrder),
    isActive: d.isActive,
  };
}

/** The service menu as a list; adding and editing happen in a sheet. */
export function ServicesSettings() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const list = useApi('/api/admin/services', serviceListResponseSchema, { version });
  const [editing, setEditing] = useState<AdminServiceView | 'new' | null>(null);
  const refresh = () => {
    setVersion((v) => v + 1);
  };

  return (
    <section
      className="exq-adm-services"
      data-state={list.status}
      aria-labelledby="exq-adm-services-title"
    >
      <h2 id="exq-adm-services-title">Services</h2>
      <p>
        <Button
          size="sm"
          onClick={() => {
            setEditing('new');
          }}
        >
          Add a service
        </Button>
      </p>
      {list.status !== 'ready' ? (
        <Status state={list.status} />
      ) : (
        <ul className="exq-adm-services__list">
          {list.data.services.map((s) => (
            <li
              key={s.id}
              className="exq-adm-services__item"
              data-state={s.deletedAt ? 'deleted' : s.isActive ? 'active' : 'hidden'}
            >
              <span className="exq-adm-services__name">
                <strong>{s.name}</strong>
                <span className="exq-muted">
                  {' '}
                  {s.group}, {s.durationMinutes} min, {s.priceFrom ? 'from ' : ''}
                  {money(s.priceCents)}
                  {s.deletedAt ? ', removed' : s.isActive ? '' : ', hidden from booking'}
                </span>
              </span>
              {s.deletedAt ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(s);
                  }}
                >
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={editing !== null}
        title={editing === 'new' ? 'Add a service' : (editing?.name ?? 'Service')}
        onClose={() => {
          setEditing(null);
        }}
      >
        {editing === 'new' ? (
          <ServiceForm
            idPrefix="new"
            initial={EMPTY}
            submitLabel="Add service"
            onSubmit={async (d) => {
              await apiRequest('/api/admin/services', serviceResponseSchema, {
                method: 'POST',
                body: bodyOf(d),
              });
              toast({ text: 'Service added.', tone: 'ok' });
              setEditing(null);
              refresh();
            }}
          />
        ) : editing ? (
          <>
            <ServiceForm
              idPrefix={editing.id}
              initial={draftOf(editing)}
              submitLabel="Save changes"
              onSubmit={async (d) => {
                await apiRequest(`/api/admin/services/${editing.id}`, serviceResponseSchema, {
                  method: 'PATCH',
                  body: bodyOf(d),
                });
                toast({ text: 'Service saved.', tone: 'ok' });
                setEditing(null);
                refresh();
              }}
            />
            <RemoveService
              service={editing}
              onRemoved={() => {
                toast({ text: 'Service removed.', tone: 'ok' });
                setEditing(null);
                refresh();
              }}
            />
          </>
        ) : null}
      </Sheet>
    </section>
  );
}

function RemoveService({
  service,
  onRemoved,
}: {
  service: AdminServiceView;
  onRemoved: () => void;
}) {
  const send = useCallback(
    (_r: null, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/services/${service.id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: resolutions ? { resolutions } : {},
      }),
    [service.id],
  );
  const removal = useConflictAction(send);
  return (
    <div className="exq-adm-services__remove" data-state={removal.state.status}>
      <h3>Remove</h3>
      <p className="exq-muted">
        Removed services stay on past bookings. Future bookings that include it are listed first.
      </p>
      <Button
        variant="secondary"
        size="sm"
        disabled={removal.state.status === 'working'}
        onClick={() => {
          void removal.run(null).then((ok) => {
            if (ok) onRemoved();
          });
        }}
      >
        Remove service
      </Button>
      {removal.state.status === 'conflict' ? (
        <ConflictResolver
          affected={removal.state.affected}
          working={false}
          onSubmit={(r) => {
            void removal.resolve(r).then((ok) => {
              if (ok) onRemoved();
            });
          }}
          onCancel={removal.reset}
        />
      ) : null}
      {removal.state.status === 'error' ? <ErrorNote error={removal.state.error} /> : null}
    </div>
  );
}

function ServiceForm({
  idPrefix,
  initial,
  submitLabel,
  onSubmit,
}: {
  idPrefix: string;
  initial: ServiceDraft;
  submitLabel: string;
  onSubmit: (draft: ServiceDraft) => Promise<void>;
}) {
  const [d, setD] = useState(initial);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const id = (field: string) => `exq-adm-service-${idPrefix}-${field}`;
  function set<K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await onSubmit(d);
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <form
      className="exq-adm-service-form"
      data-state={working ? 'working' : 'idle'}
      onSubmit={(e) => void submit(e)}
    >
      <Input
        id={id('name')}
        label="Name"
        required
        maxLength={80}
        value={d.name}
        onChange={(e) => {
          set('name', e.target.value);
        }}
      />
      <Select
        id={id('group')}
        label="Group"
        value={d.group}
        onChange={(e) => {
          set('group', e.target.value === 'Beauty' ? 'Beauty' : 'Barber');
        }}
      >
        <option value="Barber">Barber</option>
        <option value="Beauty">Beauty</option>
      </Select>
      <Textarea
        id={id('description')}
        label="Description"
        maxLength={500}
        rows={2}
        value={d.description}
        onChange={(e) => {
          set('description', e.target.value);
        }}
      />
      <Input
        id={id('price')}
        label="Price in dollars"
        inputMode="decimal"
        required
        value={d.price}
        onChange={(e) => {
          set('price', e.target.value);
        }}
      />
      <p>
        <label>
          <input
            type="checkbox"
            checked={d.priceFrom}
            onChange={(e) => {
              set('priceFrom', e.target.checked);
            }}
          />{' '}
          Show as "from"
        </label>
      </p>
      <Input
        id={id('duration')}
        label="Minutes"
        type="number"
        min={5}
        max={480}
        step={5}
        required
        value={d.durationMinutes}
        onChange={(e) => {
          set('durationMinutes', e.target.value);
        }}
      />
      <Input
        id={id('buffer')}
        label="Cleanup minutes"
        hint="Leave empty for the shop default."
        type="number"
        min={0}
        max={60}
        step={5}
        value={d.bufferMinutes}
        onChange={(e) => {
          set('bufferMinutes', e.target.value);
        }}
      />
      <Input
        id={id('sort')}
        label="Order"
        type="number"
        min={0}
        value={d.sortOrder}
        onChange={(e) => {
          set('sortOrder', e.target.value);
        }}
      />
      <p>
        <label>
          <input
            type="checkbox"
            checked={d.isActive}
            onChange={(e) => {
              set('isActive', e.target.checked);
            }}
          />{' '}
          Bookable online
        </label>
      </p>
      <ErrorNote error={error} />
      <Button type="submit" loading={working}>
        {submitLabel}
      </Button>
    </form>
  );
}
