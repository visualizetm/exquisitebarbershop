import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { settingsResponseSchema } from '@shared/api/admin';
import {
  publicShopSchema,
  publicStaffListResponseSchema,
  type PublicShop,
} from '@shared/api/public';
import { galleryResponseSchema } from '@shared/api/photos';
import { heroLines } from '@shared/lib/hero';
import type { HeroCopy, LaunchOffer, VisitCopy } from '@shared/schemas/shopSettings';
import { formatCents } from '@shared/lib/money';
import {
  Button,
  ButtonAnchor,
  ErrorState,
  Input,
  Sheet,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { Status } from '@/components/Status';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { AnnouncementPanel } from '@/admin/panels/AnnouncementPanel';
import { TeamPage } from '@/admin/team/TeamPage';
import { GalleryPanel } from './GalleryPanel';
import { HomePhotoPanel } from './HomePhotoPanel';
import { HoursPanel } from './HoursPanel';
import { ReviewsPanel } from './ReviewsPanel';
import { ServicesPanel } from './ServicesPanel';
import { SECTIONS, type Section, type SectionId } from './sections';
import '@/styles/editor.css';

type Device = 'phone' | 'computer';
type SaveState = 'clean' | 'dirty' | 'saving' | 'saved';

/**
 * The Website side as one editor: the section list, a live preview of the real home page top fed
 * the unsaved draft, and the edit panel. Save and publish writes through the validated settings
 * route; a save from a stale tab is refused with "Changed somewhere else, reload".
 */
export function WebsiteEditor() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const requested = params.get('section');
  const section = SECTIONS.find((s) => s.id === requested) ?? null;
  usePageTitle(section ? `Website, ${section.label}` : 'Website editor');
  const [version, setVersion] = useState(0);
  const loaded = useApi('/api/admin/settings', settingsResponseSchema, { version });
  const shop = useApi('/api/shop', publicShopSchema, { version });
  const staff = useApi('/api/staff', publicStaffListResponseSchema, { version });
  const gallery = useApi('/api/gallery?limit=60', galleryResponseSchema, { version });
  const work = useApi('/api/gallery?home=true&limit=6', galleryResponseSchema, { version });
  const [device, setDevice] = useState<Device>('phone');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hero, setHero] = useState<HeroCopy | null>(null);
  const [visit, setVisit] = useState<(VisitCopy & { phone: string; email: string }) | null>(null);
  const [offer, setOffer] = useState<LaunchOffer | null>(null);
  const [state, setState] = useState<SaveState>('clean');
  // The updatedAt the last save answered with, so a second save right after is not refused as stale.
  const [stamp, setStamp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<SectionId | null>(null);

  // The drafts start from what is saved; Undo changes puts them back.
  useEffect(() => {
    if (loaded.status !== 'ready') return;
    setHero(loaded.data.settings.hero);
    setOffer(loaded.data.settings.launchOffer);
    setVisit({
      ...loaded.data.settings.visit,
      phone: loaded.data.settings.phone,
      email: loaded.data.settings.email,
    });
    // A reload after a save keeps "Saved. Live on the site now" on the bar.
    setState((s) => (s === 'saved' ? 'saved' : 'clean'));
  }, [loaded.status === 'ready' ? loaded.data.updatedAt : null]);

  if (!section) return <Navigate to="/admin/website?section=top" replace />;
  if (loaded.status === 'error')
    return <ErrorState title="The website settings did not load">Reload the page.</ErrorState>;
  if (loaded.status !== 'ready' || !hero || !visit || !offer) return <Status state="loading" />;
  const settings = loaded.data.settings;
  const saved = stamp ?? loaded.data.updatedAt ?? null;
  const dirty = state === 'dirty' || state === 'saving';

  const go = (id: SectionId) => {
    if (dirty && id !== section.id) {
      setLeaving(id);
      return;
    }
    setParams({ section: id });
  };
  const undo = () => {
    setHero(settings.hero);
    setOffer(settings.launchOffer);
    setVisit({ ...settings.visit, phone: settings.phone, email: settings.email });
    setState('clean');
    setError(null);
  };

  async function save() {
    setState('saving');
    setError(null);
    try {
      const res = await apiRequest('/api/admin/settings', settingsResponseSchema, {
        method: 'PUT',
        body: {
          ...settings,
          hero,
          launchOffer: offer ?? settings.launchOffer,
          visit: { parking: visit?.parking ?? '', goodToKnow: visit?.goodToKnow ?? [] },
          phone: visit?.phone ?? settings.phone,
          email: visit?.email ?? settings.email,
          expectedUpdatedAt: saved ?? undefined,
        },
      });
      setStamp(res.updatedAt ?? null);
      setState('saved');
      setVersion((v) => v + 1);
      toast({ text: 'Saved. Live on the site now', tone: 'ok' });
    } catch (err) {
      setState('dirty');
      setError(
        err instanceof ApiRequestError && err.code === 'CONFLICT'
          ? 'Changed somewhere else, reload'
          : err instanceof ApiRequestError && err.code === 'VALIDATION_ERROR'
            ? (err.details?.[0]?.message ?? 'Check the fields and try again.')
            : 'That did not save. Try again.',
      );
    }
  }

  const counts = {
    reviews: shop.status === 'ready' ? (shop.data.reviews ?? []).length : null,
    staff: staff.status === 'ready' ? staff.data.staff.length : null,
    gallery: gallery.status === 'ready' ? gallery.data.photos.length : null,
    work: work.status === 'ready' ? work.data.photos.length : null,
    services: null as number | null,
  };
  const statusOf = (id: SectionId): string => {
    switch (id) {
      case 'announcement':
        return settings.announcement.enabled ? 'On' : 'Off';
      case 'top':
        return shop.status === 'ready' && shop.data.heroPhoto ? 'Photo + headline' : 'Headline';
      case 'offer':
        return offer.enabled ? 'On' : 'Off';
      case 'work':
        return counts.work === null ? '' : `${String(counts.work)} photos`;
      case 'reviews':
        return counts.reviews === null ? '' : `${String(counts.reviews)} shown`;
      case 'hours':
        return shop.status === 'ready' && shop.data.hours.mon.length === 0 ? 'Closed Mon' : 'Set';
      case 'services':
        return 'Menu';
      case 'team':
        return counts.staff === null ? '' : String(counts.staff);
      case 'gallery':
        return counts.gallery === null ? '' : `${String(counts.gallery)} photos`;
      case 'visit':
        return 'Phone';
    }
  };
  const publicShop = shop.status === 'ready' ? shop.data : null;

  const preview = (
    <Preview device={device} onDevice={setDevice} shop={publicShop} hero={hero} section={section} />
  );

  return (
    <div className="exq-editor" data-section={section.id} data-state={state}>
      <div className="exq-editor__bar">
        <p className="exq-editor__status exq-label" role="status" data-state={state}>
          {state === 'saved'
            ? 'Saved. Live on the site now'
            : state === 'saving'
              ? 'Saving'
              : state === 'dirty'
                ? 'Unsaved changes'
                : 'Everything on the site is saved'}
        </p>
        <div className="exq-editor__bar-actions">
          <Button
            variant="outline"
            size="sm"
            className="exq-editor__preview-btn"
            onClick={() => {
              setPreviewOpen(true);
            }}
          >
            Preview
          </Button>
          <ButtonAnchor
            variant="ghost"
            size="sm"
            href={section.path}
            target="_blank"
            rel="noopener noreferrer"
          >
            View site
          </ButtonAnchor>
        </div>
      </div>
      <div className="exq-editor__grid">
        <nav className="exq-editor__list" aria-label="Website sections">
          {(['Home page', 'Shop info'] as const).map((group) => (
            <div key={group} className="exq-editor__group">
              <p className="exq-label exq-editor__group-title">{group}</p>
              <ul className="exq-bare">
                {SECTIONS.filter((s) => s.group === group).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="exq-editor__item"
                      aria-current={s.id === section.id ? 'page' : undefined}
                      onClick={() => {
                        go(s.id);
                      }}
                    >
                      <span>{s.label}</span>
                      <span className="exq-editor__tag exq-label">{statusOf(s.id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="exq-editor__preview">{preview}</div>
        <section className="exq-editor__panel" aria-labelledby="exq-editor-panel-title">
          <p className="exq-label">{section.group}</p>
          <h1 id="exq-editor-panel-title" className="exq-editor__title">
            {section.label}
          </h1>
          {section.id === 'top' ? (
            <>
              <p className="exq-muted">
                The first thing people see. Changes show in the preview and go live when you save.
              </p>
              <HeroForm
                hero={hero}
                onChange={(next) => {
                  setHero(next);
                  setState('dirty');
                }}
                onSave={() => void save()}
                onUndo={undo}
                state={state}
                error={error}
              />
              <HomePhotoPanel />
            </>
          ) : null}
          {section.id === 'announcement' ? <AnnouncementPanel showViewLink={false} /> : null}
          {section.id === 'offer' ? (
            <OfferForm
              offer={offer}
              usage={loaded.data.launchOfferUsage ?? null}
              onChange={(next) => {
                setOffer(next);
                setState('dirty');
              }}
              onSave={() => void save()}
              onUndo={undo}
              state={state}
              error={error}
            />
          ) : null}
          {section.id === 'work' ? (
            <>
              <p className="exq-muted">
                Pick the photos marked for Home and drag them into order; the first six show.
              </p>
              <GalleryPanel />
            </>
          ) : null}
          {section.id === 'reviews' ? <ReviewsPanel /> : null}
          {section.id === 'hours' ? <HoursPanel /> : null}
          {section.id === 'services' ? <ServicesPanel /> : null}
          {section.id === 'team' ? <TeamPage /> : null}
          {section.id === 'gallery' ? <GalleryPanel /> : null}
          {section.id === 'visit' ? (
            <VisitForm
              visit={visit}
              onChange={(next) => {
                setVisit(next);
                setState('dirty');
              }}
              onSave={() => void save()}
              onUndo={undo}
              state={state}
              error={error}
            />
          ) : null}
        </section>
      </div>

      <Dialog
        variant="full"
        open={previewOpen}
        title="Preview"
        onClose={() => {
          setPreviewOpen(false);
        }}
      >
        <div className="exq-editor__preview exq-editor__preview--full">{preview}</div>
      </Dialog>

      <Sheet
        open={leaving !== null}
        title="Leave without saving?"
        onClose={() => {
          setLeaving(null);
        }}
      >
        <div className="exq-editor__leave">
          <p>Your changes here are not saved yet.</p>
          <Button
            size="lg"
            onClick={() => {
              setLeaving(null);
            }}
          >
            Keep editing
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              const next = leaving;
              undo();
              setLeaving(null);
              if (next) setParams({ section: next });
            }}
          >
            Discard changes
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function HeroForm({
  hero,
  onChange,
  onSave,
  onUndo,
  state,
  error,
}: {
  hero: HeroCopy;
  onChange: (next: HeroCopy) => void;
  onSave: () => void;
  onUndo: () => void;
  state: SaveState;
  error: string | null;
}) {
  const words = hero.headline
    .split(/\s+/)
    .map((w) => w.replace(/[.,!?]+$/, ''))
    .filter(Boolean);
  const redOk = words.includes(hero.redWord);
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    onSave();
  }
  return (
    <form className="exq-editor__form" onSubmit={submit}>
      <Input
        label="Headline"
        hint={`${String(hero.headline.length)} of 48 characters`}
        maxLength={48}
        required
        value={hero.headline}
        onChange={(e) => {
          onChange({ ...hero, headline: e.target.value });
        }}
      />
      <Input
        label="Word in red"
        hint={redOk ? 'Painted red in the headline' : 'Must be one of the words in the headline'}
        error={redOk ? undefined : 'Must be one of the words in the headline'}
        maxLength={24}
        required
        value={hero.redWord}
        onChange={(e) => {
          onChange({ ...hero, redWord: e.target.value.trim() });
        }}
      />
      <Textarea
        label="Line under it"
        rows={2}
        maxLength={160}
        required
        value={hero.subline}
        onChange={(e) => {
          onChange({ ...hero, subline: e.target.value });
        }}
      />
      {error ? (
        <p className="exq-editor__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="exq-editor__actions">
        <Button type="button" variant="outline" disabled={state !== 'dirty'} onClick={onUndo}>
          Undo changes
        </Button>
        <Button type="submit" variant="accent" loading={state === 'saving'} disabled={!redOk}>
          Save and publish
        </Button>
      </div>
    </form>
  );
}

/** Whole dollars in the field, integer cents in the settings. */
function dollars(cents: number): string {
  return String(Math.round(cents / 100));
}
function cents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function OfferForm({
  offer,
  usage,
  onChange,
  onSave,
  onUndo,
  state,
  error,
}: {
  offer: LaunchOffer;
  usage: { count: number; amountCents: number } | null;
  onChange: (next: LaunchOffer) => void;
  onSave: () => void;
  onUndo: () => void;
  state: SaveState;
  error: string | null;
}) {
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    onSave();
  }
  return (
    <form className="exq-editor__form" onSubmit={submit}>
      <p className="exq-muted">
        An amount off a client's first online booking. The site decides at booking time: online
        bookings only, once per phone number, and only when the price reaches the minimum. Walk-ins
        and bookings you or a barber add never get it.
      </p>
      {usage ? (
        <p className="exq-editor__usage" data-testid="offer-usage">
          Used {String(usage.count)} {usage.count === 1 ? 'time' : 'times'},{' '}
          {formatCents(usage.amountCents)} off
        </p>
      ) : null}
      <Switch
        label="Offer on"
        checked={offer.enabled}
        onChange={(next) => {
          onChange({ ...offer, enabled: next });
        }}
      />
      <Input
        label="Amount off, in dollars"
        type="number"
        min={0}
        step={1}
        required
        value={dollars(offer.amountCents)}
        onChange={(e) => {
          onChange({ ...offer, amountCents: cents(e.target.value) });
        }}
      />
      <Input
        label="Minimum price, in dollars"
        hint="The booking's price has to reach this before the offer applies."
        type="number"
        min={0}
        step={1}
        required
        value={dollars(offer.minTotalCents)}
        onChange={(e) => {
          onChange({ ...offer, minTotalCents: cents(e.target.value) });
        }}
      />
      <Input
        label="Words on the site"
        hint="Shows as a small red tag on the home page and the Book page while the offer is on."
        required
        maxLength={60}
        value={offer.label}
        onChange={(e) => {
          onChange({ ...offer, label: e.target.value });
        }}
      />
      <Input
        label="First day (optional)"
        type="date"
        value={offer.startsOn}
        onChange={(e) => {
          onChange({ ...offer, startsOn: e.target.value });
        }}
      />
      <Input
        label="Last day (optional)"
        hint="After this day the offer switches itself off."
        type="date"
        value={offer.endsOn}
        onChange={(e) => {
          onChange({ ...offer, endsOn: e.target.value });
        }}
      />
      {error ? (
        <p className="exq-editor__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="exq-editor__actions">
        <Button type="button" variant="outline" disabled={state !== 'dirty'} onClick={onUndo}>
          Undo changes
        </Button>
        <Button type="submit" variant="accent" loading={state === 'saving'}>
          Save and publish
        </Button>
      </div>
    </form>
  );
}

function VisitForm({
  visit,
  onChange,
  onSave,
  onUndo,
  state,
  error,
}: {
  visit: VisitCopy & { phone: string; email: string };
  onChange: (next: VisitCopy & { phone: string; email: string }) => void;
  onSave: () => void;
  onUndo: () => void;
  state: SaveState;
  error: string | null;
}) {
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    onSave();
  }
  return (
    <form className="exq-editor__form" onSubmit={submit}>
      <Input
        label="Phone"
        required
        value={visit.phone}
        onChange={(e) => {
          onChange({ ...visit, phone: e.target.value });
        }}
      />
      <Input
        label="Email"
        hint="Shown on the site once it is no longer the stand-in address."
        type="email"
        required
        value={visit.email}
        onChange={(e) => {
          onChange({ ...visit, email: e.target.value });
        }}
      />
      <Textarea
        label="Parking"
        hint="Where to park. Leave empty to keep the placeholder line."
        rows={3}
        maxLength={300}
        value={visit.parking}
        onChange={(e) => {
          onChange({ ...visit, parking: e.target.value });
        }}
      />
      <Textarea
        label="Good to know"
        hint="One line each, up to six."
        rows={4}
        value={visit.goodToKnow.join('\n')}
        onChange={(e) => {
          onChange({
            ...visit,
            goodToKnow: e.target.value
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .slice(0, 6),
          });
        }}
      />
      {error ? (
        <p className="exq-editor__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="exq-editor__actions">
        <Button type="button" variant="outline" disabled={state !== 'dirty'} onClick={onUndo}>
          Undo changes
        </Button>
        <Button type="submit" variant="accent" loading={state === 'saving'}>
          Save and publish
        </Button>
      </div>
    </form>
  );
}

/**
 * The real home page top, in a phone frame or a computer frame scaled to fit, fed the unsaved
 * draft. The section being edited carries a red outline and an Editing tag.
 */
function Preview({
  device,
  onDevice,
  shop,
  hero,
  section,
}: {
  device: Device;
  onDevice: (d: Device) => void;
  shop: PublicShop | null;
  hero: HeroCopy;
  section: Section;
}) {
  const lines = heroLines(hero);
  const photo = shop?.heroPhoto ?? null;
  const announcement = shop?.announcement;
  const editing = (id: SectionId) => (section.id === id ? 'editing' : 'idle');
  return (
    <div className="exq-editor__frame-wrap">
      <div className="exq-editor__devices" role="group" aria-label="Preview size">
        <Button
          size="sm"
          variant={device === 'phone' ? 'primary' : 'outline'}
          onClick={() => {
            onDevice('phone');
          }}
          pressed={device === 'phone'}
        >
          Phone
        </Button>
        <Button
          size="sm"
          variant={device === 'computer' ? 'primary' : 'outline'}
          onClick={() => {
            onDevice('computer');
          }}
          pressed={device === 'computer'}
        >
          Computer
        </Button>
      </div>
      <div className="exq-editor__frame" data-device={device}>
        <div className="exq-editor__page">
          <div className="exq-editor__strip" data-state={editing('announcement')}>
            {announcement?.enabled ? (
              <span>
                {announcement.text}
                {announcement.linkLabel ? (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span> {announcement.linkLabel}
                  </>
                ) : null}
              </span>
            ) : (
              <span>
                Walk-ins welcome <span aria-hidden="true">·</span> Book online
              </span>
            )}
            {section.id === 'announcement' ? (
              <span className="exq-editor__editing">Editing</span>
            ) : null}
          </div>
          <div
            className="exq-editor__hero"
            data-state={editing('top')}
            data-photo={photo ? 'true' : 'false'}
          >
            {photo ? (
              <img
                className="exq-editor__hero-photo"
                src={photo.url}
                alt=""
                width={photo.width}
                height={photo.height}
              />
            ) : null}
            <div className="exq-editor__hero-text">
              <p className="exq-label">
                Barber &amp; Beauty Lounge <span aria-hidden="true">·</span>{' '}
                {shop ? `${shop.address.city} ${shop.address.state}` : 'Brookhaven PA'}
              </p>
              <p className="exq-editor__hero-title exq-display" data-testid="preview-headline">
                {lines.map((l) => (
                  <span
                    key={l.text}
                    className="exq-editor__hero-line"
                    data-accent={l.accent ? 'true' : undefined}
                  >
                    {l.text}
                  </span>
                ))}
              </p>
              <p className="exq-editor__hero-sub">{hero.subline}</p>
              <p className="exq-editor__hero-actions">
                <span className="exq-btn" data-variant="primary">
                  Book a chair
                </span>
                <span className="exq-btn" data-variant="outline">
                  See services
                </span>
              </p>
            </div>
            {section.id === 'top' ? <span className="exq-editor__editing">Editing</span> : null}
          </div>
          <div
            className="exq-editor__below"
            data-state={
              section.group === 'Home page' && section.id !== 'top' && section.id !== 'announcement'
                ? 'editing'
                : 'idle'
            }
          >
            <p className="exq-label">Today's chairs</p>
            <p className="exq-muted">
              {section.group === 'Shop info'
                ? `This section lives on ${section.path}. Open View site to see it live.`
                : `${section.label} sits further down the home page.`}
            </p>
            {section.group === 'Home page' &&
            section.id !== 'top' &&
            section.id !== 'announcement' ? (
              <span className="exq-editor__editing">Editing</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
