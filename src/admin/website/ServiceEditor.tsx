import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  serviceResponseSchema,
  staffListResponseSchema,
  staffMutationResponseSchema,
  type AdminServiceView,
  type AdminStaffView,
  type ConflictResolution,
} from '@shared/api/admin';
import { parseDollarsToCents } from '@shared/lib/money';
import { Button, Checkbox, Input, Select, Textarea, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { Resolver } from '../panels/Resolver';
import type { AffectedBooking } from '../useConflictAction';

interface Pending {
  staff: AdminStaffView;
  serviceIds: string[];
  affected: AffectedBooking[];
}

/**
 * Name, description, price, time and which barbers do the service. Saving writes the service, then
 * each barber whose list changed. Taking a service away from a barber with upcoming bookings for it
 * asks what to do with each of them first.
 */
export function ServiceEditor({
  service,
  nextSortOrder,
  onSaved,
}: {
  service: AdminServiceView | null;
  nextSortOrder: number;
  onSaved: () => void;
}) {
  const toast = useToast();
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const [name, setName] = useState(service?.name ?? '');
  const [group, setGroup] = useState<'Barber' | 'Beauty'>(service?.group ?? 'Barber');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(service ? (service.priceCents / 100).toFixed(2) : '');
  const [priceFrom, setPriceFrom] = useState(service?.priceFrom ?? false);
  const [minutes, setMinutes] = useState(String(service?.durationMinutes ?? 30));
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [savedId, setSavedId] = useState<string | null>(service?.id ?? null);

  if (staff.status !== 'ready')
    return (
      <div className="exq-panelbody">
        <Status state={staff.status === 'error' ? 'error' : 'loading'} />
      </div>
    );
  const barbers = staff.data.staff.filter((s) => !s.deletedAt);
  const doing =
    chosen ??
    (service ? barbers.filter((b) => b.serviceIds.includes(service.id)).map((b) => b.id) : []);

  async function patchStaff(
    b: AdminStaffView,
    serviceIds: string[],
    resolutions?: ConflictResolution[],
  ) {
    await apiRequest(`/api/admin/staff/${b.id}`, staffMutationResponseSchema, {
      method: 'PATCH',
      body: { serviceIds, ...(resolutions ? { resolutions } : {}) },
    });
  }

  /** Writes each barber's list. A conflict stops the queue and asks; the rest wait behind it. */
  async function run(queue: Pending[]) {
    const [head, ...rest] = queue;
    if (!head) {
      toast({ text: `${name.trim()} is saved. The site shows it right away.`, tone: 'ok' });
      onSaved();
      return;
    }
    try {
      await patchStaff(head.staff, head.serviceIds);
      await run(rest);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'SCHEDULE_CONFLICT') {
        setPending([{ ...head, affected: err.affected ?? [] }, ...rest]);
        return;
      }
      throw err;
    }
  }

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const cents = parseDollarsToCents(price);
      if (cents === null) throw new Error('Enter the price in dollars, for example 35 or 35.00');
      const body = {
        name: name.trim(),
        group,
        description: description.trim(),
        priceCents: cents,
        priceFrom,
        durationMinutes: Number(minutes),
        ...(service ? {} : { bufferMinutes: null, sortOrder: nextSortOrder, isActive: true }),
      };
      const saved = service
        ? await apiRequest(`/api/admin/services/${service.id}`, serviceResponseSchema, {
            method: 'PATCH',
            body,
          })
        : await apiRequest('/api/admin/services', serviceResponseSchema, { method: 'POST', body });
      setSavedId(saved.service.id);
      const id = saved.service.id;
      const queue = barbers
        .filter((b) => b.serviceIds.includes(id) !== doing.includes(b.id))
        .map((b) => ({
          staff: b,
          serviceIds: doing.includes(b.id)
            ? [...b.serviceIds, id]
            : b.serviceIds.filter((x) => x !== id),
          affected: [],
        }));
      await run(queue);
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  const head = pending[0];
  if (head) {
    return (
      <div className="exq-panelbody">
        <Resolver
          affected={head.affected}
          working={working}
          title={`${head.staff.name} has ${head.affected.length} upcoming ${head.affected.length === 1 ? 'booking' : 'bookings'} for ${name.trim()}`}
          intro={`${head.staff.name} would stop doing it. Choose what happens to each booking.`}
          onBack={() => {
            setPending([]);
          }}
          onSubmit={(resolutions) => {
            setWorking(true);
            patchStaff(head.staff, head.serviceIds, resolutions)
              .then(() => {
                const rest = pending.slice(1);
                setPending([]);
                return run(rest);
              })
              .catch((err: unknown) => {
                setError(err);
              })
              .finally(() => {
                setWorking(false);
              });
          }}
        />
        <ErrorNote error={error} />
      </div>
    );
  }

  return (
    <form
      className="exq-panelbody"
      onSubmit={(e) => void submit(e)}
      data-saved={savedId ? 'true' : 'false'}
    >
      <Input
        label="Name"
        required
        maxLength={80}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <Select
        label="Section"
        value={group}
        onChange={(e) => {
          setGroup(e.target.value === 'Beauty' ? 'Beauty' : 'Barber');
        }}
      >
        <option value="Barber">Barber</option>
        <option value="Beauty">Beauty</option>
      </Select>
      <Textarea
        label="Description"
        maxLength={500}
        rows={3}
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
        }}
      />
      <div className="exq-panelbody__row">
        <Input
          label="Price in dollars"
          required
          inputMode="decimal"
          placeholder="35.00"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
          }}
        />
        <Input
          label="Minutes"
          type="number"
          required
          min={5}
          max={480}
          step={5}
          value={minutes}
          onChange={(e) => {
            setMinutes(e.target.value);
          }}
        />
      </div>
      <Checkbox
        label="Show it as a starting price"
        hint='The site says "From $35".'
        checked={priceFrom}
        onChange={(e) => {
          setPriceFrom(e.target.checked);
        }}
      />
      <fieldset className="exq-fieldset">
        <legend>Who does it</legend>
        {barbers.map((b) => (
          <Checkbox
            key={b.id}
            label={b.name}
            checked={doing.includes(b.id)}
            onChange={(e) => {
              setChosen(e.target.checked ? [...doing, b.id] : doing.filter((id) => id !== b.id));
            }}
          />
        ))}
      </fieldset>
      <ErrorNote error={error} />
      <Button type="submit" loading={working}>
        {service ? 'Save service' : 'Add service'}
      </Button>
    </form>
  );
}
