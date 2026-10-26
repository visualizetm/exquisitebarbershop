import { useCallback, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  conflictOnlyResponseSchema,
  staffMutationResponseSchema,
  staffResponseSchema,
  type AdminStaffView,
  type ConflictResolution,
} from '@shared/api/admin';
import { slugify } from '@shared/lib/slug';
import { Button, Checkbox, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { ErrorNote } from '../components/ErrorNote';
import { PhotoManager } from '../components/PhotoManager';
import { useConflictAction } from '../useConflictAction';
import { Resolver } from '../panels/Resolver';

/** Photo, name, what they are known for, bio, Instagram, whether they show on the site, the web address and removal. */
export function ProfileTab({
  member,
  onChanged,
}: {
  member: AdminStaffView;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(member.name);
  const [title, setTitle] = useState(member.title);
  const [role, setRole] = useState(member.role);
  const [specialty, setSpecialty] = useState(member.specialty);
  const [bio, setBio] = useState(member.bio);
  const [instagram, setInstagram] = useState(member.instagramHandle ?? '');
  const [show, setShow] = useState(member.showOnWebsite);
  const [online, setOnline] = useState(member.acceptsOnlineBooking);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/staff/${member.id}`, staffMutationResponseSchema, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          title: title.trim(),
          role,
          specialty: specialty.trim(),
          bio: bio.trim(),
          instagramHandle: instagram.trim() === '' ? null : instagram.trim().replace(/^@/, ''),
          showOnWebsite: show,
          acceptsOnlineBooking: online,
        },
      });
      onChanged();
      toast({ text: 'Profile saved. The site shows it right away.', tone: 'ok' });
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="exq-tabbody">
      <section aria-labelledby="exq-prof-photo">
        <h2 id="exq-prof-photo" className="exq-bsheet__h">
          Photo
        </h2>
        <p className="exq-muted">The first photo is the portrait on the site.</p>
        <PhotoManager kind="staff" staffId={member.id} title={`Photos of ${member.name}`} />
      </section>

      <form className="exq-panelbody" onSubmit={(e) => void save(e)}>
        <h2 className="exq-bsheet__h">Profile</h2>
        <div className="exq-panelbody__row">
          <Input
            label="Name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
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
        <Select
          label="Role"
          value={role}
          onChange={(e) => {
            setRole(
              e.target.value === 'stylist'
                ? 'stylist'
                : e.target.value === 'owner'
                  ? 'owner'
                  : 'barber',
            );
          }}
        >
          <option value="barber">Barber</option>
          <option value="stylist">Stylist</option>
          <option value="owner">Owner</option>
        </Select>
        <Input
          label="Specialty"
          hint="What they are known for, one line."
          maxLength={200}
          value={specialty}
          onChange={(e) => {
            setSpecialty(e.target.value);
          }}
        />
        <Textarea
          label="Bio"
          maxLength={2000}
          rows={4}
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
          }}
        />
        <Input
          label="Instagram"
          hint="The handle, without the @."
          value={instagram}
          onChange={(e) => {
            setInstagram(e.target.value);
          }}
        />
        <Checkbox
          label="Show on site"
          hint="On: they appear on the website and in booking."
          checked={show}
          onChange={(e) => {
            setShow(e.target.checked);
          }}
        />
        <Checkbox
          label="Takes online bookings"
          hint="Off: the site shows Book through Instagram if they have a handle, otherwise Walk-ins only. They are left out of online booking."
          checked={online}
          onChange={(e) => {
            setOnline(e.target.checked);
          }}
        />
        <ErrorNote error={error} />
        <div>
          <Button type="submit" loading={working}>
            Save profile
          </Button>
        </div>
      </form>

      <SlugForm member={member} onChanged={onChanged} />
      <RemoveBarber member={member} onChanged={onChanged} />
    </div>
  );
}

function SlugForm({ member, onChanged }: { member: AdminStaffView; onChanged: () => void }) {
  const toast = useToast();
  const [slug, setSlug] = useState(member.slug);
  const [error, setError] = useState<unknown>(null);
  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiRequest(`/api/admin/staff/${member.id}/slug`, staffResponseSchema, {
        method: 'POST',
        body: { slug },
      });
      onChanged();
      toast({ text: 'Web address changed. The old one still works.', tone: 'ok' });
    } catch (err) {
      setError(err);
    }
  }
  return (
    <form className="exq-panelbody" onSubmit={(e) => void submit(e)}>
      <h2 className="exq-bsheet__h">Web address</h2>
      <p className="exq-muted">
        Now /chairs/{member.slug}.
        {member.slugAliases.length > 0
          ? ` Old addresses that still work: ${member.slugAliases.join(', ')}.`
          : ''}{' '}
        Renaming keeps every old address working forever, so printed QR codes never break.
      </p>
      <Input
        label="New web address name"
        required
        value={slug}
        onChange={(e) => {
          setSlug(slugify(e.target.value));
        }}
      />
      <ErrorNote error={error} />
      <div>
        <Button type="submit" variant="outline" disabled={slug === member.slug}>
          Rename
        </Button>
      </div>
    </form>
  );
}

function RemoveBarber({ member, onChanged }: { member: AdminStaffView; onChanged: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const send = useCallback(
    (_r: null, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${member.id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: resolutions ? { resolutions } : {},
      }),
    [member.id],
  );
  const action = useConflictAction(send);

  function removed() {
    onChanged();
    toast({ text: `${member.name} is removed from the schedule.`, tone: 'ok' });
    void navigate('/admin/shop/team');
  }

  return (
    <section className="exq-panelbody exq-danger" aria-labelledby="exq-prof-remove">
      <h2 id="exq-prof-remove" className="exq-bsheet__h">
        Remove from schedule
      </h2>
      <p className="exq-muted">
        Hides {member.name} from the website and booking and turns off their login. Past bookings
        stay. Their web address and old addresses still work: they open the booking page with anyone
        available.
      </p>
      {action.state.status === 'conflict' ? (
        <Resolver
          affected={action.state.affected}
          working={false}
          title={`${action.state.affected.length} upcoming ${action.state.affected.length === 1 ? 'booking needs' : 'bookings need'} a decision`}
          intro={`${member.name} is not removed yet. Choose what happens to each booking.`}
          applyLabel={`Remove ${member.name}`}
          onBack={action.reset}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) removed();
            });
          }}
        />
      ) : (
        <div>
          <Button
            variant="outline"
            loading={action.state.status === 'working'}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Remove {member.name}
          </Button>
        </div>
      )}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
      <Modal
        open={confirming}
        title={`Remove ${member.name}?`}
        onClose={() => {
          setConfirming(false);
        }}
      >
        <div className="exq-panelbody">
          <p>
            They disappear from the site and from booking. If clients are booked with them you will
            choose what happens to each.
          </p>
          <div className="exq-panelbody__row">
            <Button
              variant="accent"
              onClick={() => {
                setConfirming(false);
                void action.run(null).then((ok) => {
                  if (ok) removed();
                });
              }}
            >
              Remove {member.name}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep them
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
