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

export function ServicesSettings() {
  const [version, setVersion] = useState(0);
  const list = useApi('/api/admin/services', serviceListResponseSchema, { version });
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
      <details className="exq-adm-services__create">
        <summary>Add a service</summary>
        <ServiceForm
          idPrefix="new"
          initial={EMPTY}
          submitLabel="Add service"
          onSubmit={async (d) => {
            await apiRequest('/api/admin/services', serviceResponseSchema, {
              method: 'POST',
              body: bodyOf(d),
            });
            refresh();
          }}
        />
      </details>
      {list.status !== 'ready' ? (
        <Status state={list.status} />
      ) : (
        <ul className="exq-adm-services__list">
          {list.data.services.map((s) => (
            <ServiceRow key={`${s.id}-${String(version)}`} service={s} onChanged={refresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ServiceRow({ service, onChanged }: { service: AdminServiceView; onChanged: () => void }) {
  const send = useCallback(
    (_r: null, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/services/${service.id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: resolutions ? { resolutions } : {},
      }),
    [service.id],
  );
  const removal = useConflictAction(send);
  const deleted = service.deletedAt !== null;

  return (
    <li
      className="exq-adm-services__item"
      data-state={deleted ? 'deleted' : service.isActive ? 'active' : 'hidden'}
    >
      <details>
        <summary>
          {service.name}, {service.durationMinutes} min, {service.priceFrom ? 'from ' : ''}
          {money(service.priceCents)}
          {deleted ? ' (removed)' : service.isActive ? '' : ' (hidden from booking)'}
        </summary>
        {deleted ? (
          <p>Removed services stay on past bookings and cannot be edited.</p>
        ) : (
          <>
            <ServiceForm
              idPrefix={service.id}
              initial={draftOf(service)}
              submitLabel="Save changes"
              onSubmit={async (d) => {
                await apiRequest(`/api/admin/services/${service.id}`, serviceResponseSchema, {
                  method: 'PATCH',
                  body: bodyOf(d),
                });
                onChanged();
              }}
            />
            <p>
              <button
                type="button"
                className="exq-adm-services__remove"
                disabled={removal.state.status === 'working'}
                onClick={() => {
                  void removal.run(null).then((ok) => {
                    if (ok) onChanged();
                  });
                }}
              >
                Remove service
              </button>
            </p>
          </>
        )}
        {removal.state.status === 'conflict' ? (
          <ConflictResolver
            affected={removal.state.affected}
            working={false}
            onSubmit={(r) => {
              void removal.resolve(r).then((ok) => {
                if (ok) onChanged();
              });
            }}
            onCancel={removal.reset}
          />
        ) : null}
        {removal.state.status === 'error' ? <ErrorNote error={removal.state.error} /> : null}
      </details>
    </li>
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
      if (idPrefix === 'new') setD(initial);
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
      <p>
        <label htmlFor={id('group')}>Group</label>{' '}
        <select
          id={id('group')}
          value={d.group}
          onChange={(e) => {
            set('group', e.target.value === 'Beauty' ? 'Beauty' : 'Barber');
          }}
        >
          <option value="Barber">Barber</option>
          <option value="Beauty">Beauty</option>
        </select>
      </p>
      <p>
        <label htmlFor={id('description')}>Description</label>{' '}
        <textarea
          id={id('description')}
          maxLength={500}
          rows={2}
          value={d.description}
          onChange={(e) => {
            set('description', e.target.value);
          }}
        />
      </p>
      <p>
        <label htmlFor={id('price')}>Price in dollars</label>{' '}
        <input
          id={id('price')}
          inputMode="decimal"
          required
          value={d.price}
          onChange={(e) => {
            set('price', e.target.value);
          }}
        />{' '}
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
      <p>
        <label htmlFor={id('duration')}>Minutes</label>{' '}
        <input
          id={id('duration')}
          type="number"
          min={5}
          max={480}
          step={5}
          required
          value={d.durationMinutes}
          onChange={(e) => {
            set('durationMinutes', e.target.value);
          }}
        />{' '}
        <label htmlFor={id('buffer')}>Cleanup minutes (empty for the shop default)</label>{' '}
        <input
          id={id('buffer')}
          type="number"
          min={0}
          max={60}
          step={5}
          value={d.bufferMinutes}
          onChange={(e) => {
            set('bufferMinutes', e.target.value);
          }}
        />
      </p>
      <p>
        <label htmlFor={id('sort')}>Order</label>{' '}
        <input
          id={id('sort')}
          type="number"
          min={0}
          value={d.sortOrder}
          onChange={(e) => {
            set('sortOrder', e.target.value);
          }}
        />{' '}
        <label>
          <input
            type="checkbox"
            checked={d.isActive}
            onChange={(e) => {
              set('isActive', e.target.checked);
            }}
          />{' '}
          Bookable
        </label>
      </p>
      <ErrorNote error={error} />
      <button type="submit" disabled={working}>
        {submitLabel}
      </button>
    </form>
  );
}
