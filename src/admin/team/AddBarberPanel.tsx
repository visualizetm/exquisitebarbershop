import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { serviceListResponseSchema, staffResponseSchema } from '@shared/api/admin';
import { slugify } from '@shared/lib/slug';
import { Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';

/**
 * The first step of adding a barber: who they are, what they do and the address of their page. They
 * start hidden on the site; the next steps (hours, photo, then showing them) happen on their profile.
 */
export function AddBarberPanel({ onAdded }: { onAdded: (id: string, name: string) => void }) {
  const services = useApi('/api/admin/services', serviceListResponseSchema);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('Barber');
  const [role, setRole] = useState<'barber' | 'stylist'>('barber');
  const [specialty, setSpecialty] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (services.status !== 'ready') {
    return (
      <div className="exq-panelbody">
        <Status state={services.status === 'error' ? 'error' : 'loading'} />
      </div>
    );
  }
  const live = services.data.services.filter((s) => !s.deletedAt && s.isActive);
  const chosen = serviceIds ?? live.map((s) => s.id);
  const address = slugTouched ? slug : slugify(name);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const created = await apiRequest('/api/admin/staff', staffResponseSchema, {
        method: 'POST',
        body: {
          slug: address,
          name: name.trim(),
          role,
          title: title.trim(),
          specialty: specialty.trim(),
          bio: '',
          chairNumber: null,
          serviceIds: chosen,
          photoUrl: null,
          instagramHandle: null,
          sortOrder: 100,
          acceptsOnlineBooking: true,
          showOnWebsite: false,
        },
      });
      onAdded(created.staff.id, created.staff.name);
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className="exq-panelbody" onSubmit={(e) => void submit(e)}>
      <Input
        label="Name"
        required
        maxLength={80}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <div className="exq-panelbody__row">
        <Select
          label="Role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value === 'stylist' ? 'stylist' : 'barber');
          }}
        >
          <option value="barber">Barber</option>
          <option value="stylist">Stylist</option>
        </Select>
        <Input
          label="Title"
          required
          maxLength={80}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </div>
      <Textarea
        label="Known for"
        maxLength={200}
        rows={2}
        value={specialty}
        onChange={(e) => {
          setSpecialty(e.target.value);
        }}
      />
      <Input
        label="Web address name"
        hint={`Their page will be /chairs/${address || 'name'}. It keeps working forever, even if you rename it.`}
        required
        value={address}
        onChange={(e) => {
          setSlug(slugify(e.target.value));
          setSlugTouched(true);
        }}
      />
      <fieldset className="exq-fieldset">
        <legend>Services they do</legend>
        {live.map((s) => (
          <Checkbox
            key={s.id}
            label={s.name}
            checked={chosen.includes(s.id)}
            onChange={(e) => {
              setServiceIds(
                e.target.checked ? [...chosen, s.id] : chosen.filter((id) => id !== s.id),
              );
            }}
          />
        ))}
      </fieldset>
      <p className="exq-muted">
        They stay hidden on the website until you tick Show on site on their profile.
      </p>
      <ErrorNote error={error} />
      <Button type="submit" loading={working} disabled={name.trim() === '' || address === ''}>
        Add barber
      </Button>
    </form>
  );
}
