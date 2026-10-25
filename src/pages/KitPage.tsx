import { useState } from 'react';
import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import Copy01 from '@untitled-ui/icons-react/build/esm/Copy01';
import Phone01 from '@untitled-ui/icons-react/build/esm/Phone01';
import {
  BarChart,
  Button,
  ButtonLink,
  Card,
  ChairCard,
  ChairCardSkeleton,
  Chip,
  Chips,
  EmptyState,
  ErrorState,
  DataTable,
  Footer,
  Header,
  IconButton,
  Input,
  Label,
  Lightbox,
  Lines,
  Modal,
  OptionCard,
  PhotoFrame,
  PinPad,
  PriceRow,
  Reveal,
  SearchBox,
  SectionHead,
  Select,
  Sheet,
  StatTile,
  StepBar,
  Tabs,
  Textarea,
  Ticket,
  TimeChip,
  TopStrip,
  useToast,
  type LightboxPhoto,
} from '@/components/ui';
import { BarView } from '@/components/ui/BottomBar';
import { PriceOverrideEditor } from '@/admin/team/PriceOverrideEditor';
import { ReviewsEditor } from '@/admin/website/ReviewsEditor';
import { RatingLine } from '@/components/site/RatingLine';
import { ReviewList } from '@/components/site/ReviewCard';
import type { AdminServiceView } from '@shared/api/admin';
import type { GoogleSettings, ReviewItem } from '@shared/schemas/shopSettings';
import { usePageTitle } from '@/lib/usePageTitle';
import '@/styles/dashboard.css';

const STEPS = [
  { key: 'service', label: 'Service' },
  { key: 'barber', label: 'Barber' },
  { key: 'time', label: 'Time' },
  { key: 'details', label: 'Details' },
] as const;

/** A flat sample image so the loaded state can be seen without a real upload. */
function sample(label: string, w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}"><rect width="100%" height="100%" fill="#555"/><text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="${String(Math.round(w / 8))}" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
/** The real shop prices for Haircut, Lineup and Kids Cut, and Dontrise's own entries for two of them. */
const PRICE_SERVICES: AdminServiceView[] = [
  ['Haircut', 4000, true, 45],
  ['Lineup', 2000, true, 20],
  ['Kids Cut', 2000, true, 30],
].map(([name, priceCents, priceFrom, durationMinutes], index) => ({
  id: String(index + 1).repeat(24),
  name: String(name),
  group: 'Barber' as const,
  description: '',
  priceCents: Number(priceCents),
  priceFrom: Boolean(priceFrom),
  durationMinutes: Number(durationMinutes),
  bufferMinutes: null,
  sortOrder: index,
  isActive: true,
  deletedAt: null,
}));
const PRICE_SAVED = [
  { serviceId: '1'.repeat(24), priceCents: 5000, durationMinutes: 75 },
  { serviceId: '2'.repeat(24), priceCents: 3000, durationMinutes: 40 },
];

/** Three of the shop's real reviews (a short Google one, an undated theCut one, a long one). */
const REVIEWS: ReviewItem[] = [
  {
    id: 'a'.repeat(24),
    name: 'Shamarr M.',
    source: 'google',
    stars: 5,
    date: '2025-09-14',
    text: 'Soon as I sat in the chair I felt at home this is officially my go to.',
    staffId: null,
    show: true,
    sortOrder: 0,
  },
  {
    id: 'b'.repeat(24),
    name: 'Jesse W.',
    source: 'thecut',
    stars: 5,
    text: 'Sharp cut, super quick and cool dude.',
    staffId: '4'.repeat(24),
    show: true,
    sortOrder: 10,
  },
  {
    id: 'c'.repeat(24),
    name: 'Daniel M.',
    source: 'google',
    stars: 5,
    date: '2024-10-26',
    text: 'First time customer, Dontrise cut my son’s hair(9yo). I have no complaints. He was thorough,professional and made sure he was cutting to my son and I’s liking multiple times. Clean shop. I’m not easily pleased but this was a good experience as a first time customer. They also offer wash and dry services also.',
    staffId: '5'.repeat(24),
    show: false,
    sortOrder: 20,
  },
];
const REVIEW_CARDS = REVIEWS.map((r) => ({ ...r, date: r.date ?? null }));
/** The shop's Google block as read on 2026-10-25, and one with only the place id. */
const GOOGLE: GoogleSettings = {
  placeId: 'ChIJISdW6zTpxokRzSBEJjMQU4M',
  rating: 4.7,
  reviewCount: 15,
  ratingCheckedOn: '2026-10-25',
};
const GOOGLE_UNRATED: GoogleSettings = {
  ...GOOGLE,
  rating: 0,
  reviewCount: 0,
  ratingCheckedOn: '',
};

const PHOTO = { url: sample('4:5', 400, 500), width: 400, height: 500, alt: 'Sample portrait' };
const LIGHTBOX: LightboxPhoto[] = [1, 2, 3].map((n) => ({
  id: String(n),
  url: sample(`Photo ${String(n)}`, 800, 600),
  width: 800,
  height: 600,
  alt: `Sample photo ${String(n)}`,
  barber: { name: 'Lee', slug: 'lee' },
}));

/** Every component in every state, for one theme. */
function Specimen() {
  const [tab, setTab] = useState('a');
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const [box, setBox] = useState<number | null>(null);
  const [chip, setChip] = useState('all');
  const [time, setTime] = useState('10:00 AM');
  const [picked, setPicked] = useState<string[]>(['cut']);
  const [chair, setChair] = useState('dontrise');
  const [step, setStep] = useState<(typeof STEPS)[number]['key']>('barber');

  return (
    <div className="exq-kit__specimen">
      <section className="exq-kit__block" aria-label="Frame">
        <h2>Frame</h2>
        <div className="exq-kit__frame">
          <TopStrip
            announcement={{
              enabled: true,
              text: 'Walk-ins welcome',
              linkLabel: 'Book online',
              linkUrl: '/book',
              endsOn: '',
            }}
            loading={false}
          />
          <Header phone="+16106090786" />
        </div>
        <div className="exq-kit__frame" data-label="Bottom bar, default">
          <BarView
            state="shown"
            style={{ position: 'static' }}
            config={{
              left: { label: 'Call', href: 'tel:+16106090786', tone: 'ink' },
              right: { label: 'Book now', to: '/book', tone: 'paper' },
            }}
          />
        </div>
        <div className="exq-kit__frame" data-label="Bottom bar, booking">
          <BarView
            state="shown"
            style={{ position: 'static' }}
            config={{
              mode: 'booking',
              summary: (
                <>
                  <span>From $40</span>
                  <span>45 min with Lee</span>
                </>
              ),
              left: { label: 'Back', onClick: () => undefined, tone: 'ink' },
              right: { label: 'Continue', onClick: () => undefined, tone: 'paper' },
            }}
          />
        </div>
        <div className="exq-kit__frame" data-label="Bottom bar, last step and disabled">
          <BarView
            state="shown"
            style={{ position: 'static' }}
            config={{
              left: { label: 'Back', onClick: () => undefined, tone: 'ink' },
              right: { label: 'Confirm booking', onClick: () => undefined, tone: 'red' },
            }}
          />
          <BarView
            state="shown"
            style={{ position: 'static' }}
            config={{
              left: { label: 'Back', onClick: () => undefined, tone: 'ink' },
              right: { label: 'Continue', disabled: true, tone: 'paper' },
            }}
          />
        </div>
        <Footer shop={null} />
      </section>

      <section className="exq-kit__block" aria-label="Buttons">
        <h2>Buttons</h2>
        {(['primary', 'accent', 'outline', 'ghost', 'onink'] as const).map((variant) => (
          <div
            key={variant}
            className={`exq-kit__row${variant === 'onink' ? ' exq-dark exq-kit__ink' : ''}`}
          >
            <Button variant={variant}>{variant}</Button>
            <Button variant={variant} pressed>
              Pressed
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading>
              Loading
            </Button>
            <Button variant={variant} size="sm" icon={<Phone01 aria-hidden="true" />}>
              Small
            </Button>
          </div>
        ))}
        <div className="exq-kit__row">
          <ButtonLink to="/book" size="lg">
            Book a chair
          </ButtonLink>
          <ButtonLink to="/services" variant="outline" size="lg">
            See services
          </ButtonLink>
        </div>
      </section>

      <section className="exq-kit__block" aria-label="Fields">
        <h2>Fields</h2>
        <div className="exq-grid" data-md="2">
          <Input label="Default" placeholder="Your name" autoComplete="name" />
          <Input
            label="Error"
            type="tel"
            error="Enter a valid US phone number"
            defaultValue="123"
          />
          <Input
            label="Warning"
            type="email"
            warning="This address looks unusual"
            defaultValue="x@y"
          />
          <Input label="Disabled" disabled defaultValue="Locked" />
          <Select label="Select" hint="First available picks the least booked chair">
            <option>First available</option>
            <option>Lee</option>
          </Select>
          <Textarea label="Textarea" placeholder="Anything we should know?" />
        </div>
      </section>

      <section className="exq-kit__block" aria-label="Chips">
        <h2>Chips</h2>
        <Chips label="Groups">
          {(
            [
              ['all', 'All', 13],
              ['barber', 'Barber', 8],
              ['beauty', 'Beauty', 5],
            ] as const
          ).map(([key, text, count]) => (
            <Chip
              key={key}
              selected={chip === key}
              count={count}
              onClick={() => {
                setChip(key);
              }}
            >
              {text}
            </Chip>
          ))}
          <Chip disabled count={0}>
            Nails
          </Chip>
        </Chips>
        <h3>Time chips</h3>
        <Chips label="Times">
          {['9:00 AM', '9:30 AM', '10:00 AM'].map((t) => (
            <TimeChip
              key={t}
              label={t}
              selected={time === t}
              onClick={() => {
                setTime(t);
              }}
            />
          ))}
          <TimeChip label="10:30 AM" disabled onClick={() => undefined} />
        </Chips>
      </section>

      <section className="exq-kit__block" aria-label="Cards">
        <h2>Cards</h2>
        <div className="exq-grid" data-md="2">
          <Card>A static card.</Card>
          <Card interactive>An interactive card lifts on hover.</Card>
        </div>
        <h3>Option cards</h3>
        <div className="exq-grid" data-md="2">
          {[
            { id: 'cut', name: 'Haircut', desc: 'Full haircut and lineup.', price: 'From $40' },
            { id: 'fade', name: 'Lineup', desc: 'Temple, forehead and neck.', price: 'From $20' },
          ].map((o) => (
            <OptionCard
              key={o.id}
              selected={picked.includes(o.id)}
              title={o.name}
              description={o.desc}
              meta={<span className="exq-price">{o.price}</span>}
              onChange={() => {
                setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]));
              }}
            />
          ))}
          <OptionCard
            selected={false}
            disabled
            title="Hot Towel and Steam"
            description="Unavailable today."
            meta={<span className="exq-price">$20</span>}
          />
        </div>
      </section>

      <section className="exq-kit__block" aria-label="Type and rows">
        <h2>Type and rows</h2>
        <Label>The menu</Label>
        <SectionHead label="The crew" title="Pick your chair" />
        <p className="exq-display">Display</p>
        <p className="exq-price">$40</p>
        <div className="exq-kit__ink exq-dark">
          <PriceRow
            name="Haircut"
            description="Full haircut and lineup with a straight razor finish."
            price="From $40"
            to="/book"
          />
          <PriceRow name="Lineup" description="Temple, forehead and neck." price="From $20" />
        </div>
      </section>

      <section className="exq-kit__block" aria-label="Photos and chairs">
        <h2>Photos and chairs</h2>
        <div className="exq-grid" data-cols="2" data-md="3">
          <PhotoFrame photo={PHOTO} name="Sample" />
          <PhotoFrame
            photo={{ ...PHOTO, url: sample('1:1', 400, 400) }}
            name="Sample"
            ratio="1:1"
          />
          <PhotoFrame photo={null} name="Placeholder" ratio="1:1" />
        </div>
        <PhotoFrame photo={null} name="Wide placeholder" ratio="16:9" />
        <h3>Chair cards</h3>
        <div className="exq-grid" data-cols="2" data-md="3" data-lg="4">
          <ChairCard
            name="Lee"
            specialty="Precision cuts"
            chairNumber={1}
            photo={PHOTO}
            status="next-open"
            statusLabel="Next open 2:15 PM"
          />
          <ChairCard
            name="Drew"
            specialty="Designs, color and perms"
            chairNumber={2}
            photo={null}
            status="in"
            statusLabel="In today"
          />
          <ChairCard
            name="Nelly Cutz"
            specialty="Fades and tapers"
            chairNumber={4}
            photo={null}
            status="off"
            statusLabel="Off today"
          />
          <ChairCard
            name="Dontrise"
            specialty="Fades, designs and color"
            chairNumber={1}
            photo={null}
            selected={chair === 'dontrise'}
            onSelect={() => {
              setChair(chair === 'dontrise' ? 'lee' : 'dontrise');
            }}
          />
          <ChairCard
            name="Iniya"
            specialty="Braids and wigs"
            chairNumber={5}
            photo={null}
            statusLabel="Book through Instagram"
            href="https://instagram.com/iniyathestylist"
          />
          <ChairCardSkeleton />
        </div>
      </section>

      <section className="exq-kit__block" aria-label="Progress and ticket">
        <h2>Progress and ticket</h2>
        <StepBar steps={STEPS} current={step} onJump={setStep} />
        <p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStep('details');
            }}
          >
            Go to details
          </Button>
        </p>
        <Ticket
          code="K7M-4QX2"
          heading="You are booked"
          rows={[
            { label: 'Chair', value: 'Lee' },
            { label: 'When', value: 'Thu, Oct 22, 2:15 PM' },
            { label: 'Services', value: 'Haircut' },
          ]}
          total="$40"
          actions={<Button variant="outline">Manage this booking</Button>}
        />
      </section>

      <section className="exq-kit__block" aria-label="Feedback">
        <h2>Feedback</h2>
        <div className="exq-kit__row">
          <Button
            variant="outline"
            onClick={() => {
              toast({ text: 'Saved.', tone: 'ok' });
            }}
          >
            Toast ok
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast({ text: 'That time was just taken.', tone: 'warn' });
            }}
          >
            Toast warn
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast({
                text: 'Booking marked done.',
                action: { label: 'Undo', onClick: () => undefined },
              });
            }}
          >
            Toast undo
          </Button>
        </div>
        <EmptyState
          title="Photos are coming soon"
          action={<Button variant="outline">Follow on Instagram</Button>}
        >
          Nothing here yet.
        </EmptyState>
        <ErrorState action={<Button variant="outline">Try again</Button>}>
          We could not load that.
        </ErrorState>
      </section>

      <section className="exq-kit__block" aria-label="Overlays">
        <h2>Overlays</h2>
        <div className="exq-kit__row">
          <Button
            variant="outline"
            onClick={() => {
              setSheet(true);
            }}
          >
            Open sheet
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setModal(true);
            }}
          >
            Open modal
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setBox(0);
            }}
          >
            Open lightbox
          </Button>
        </div>
        <Sheet
          open={sheet}
          title="Cancel this appointment?"
          onClose={() => {
            setSheet(false);
          }}
        >
          <p>You can book again any time.</p>
          <Button
            variant="accent"
            onClick={() => {
              setSheet(false);
            }}
          >
            Yes, cancel it
          </Button>
        </Sheet>
        <Modal
          open={modal}
          title="Reset demo data?"
          onClose={() => {
            setModal(false);
          }}
        >
          <p>This puts the sample data back.</p>
        </Modal>
        <Lightbox
          photos={LIGHTBOX}
          index={box}
          onClose={() => {
            setBox(null);
          }}
          onIndex={setBox}
        />
      </section>

      <section className="exq-kit__block" aria-label="Dashboard">
        <h2>Dashboard</h2>
        <div className="exq-dash-grid" data-cols="4">
          <StatTile
            icon={<Calendar aria-hidden="true" />}
            label="Bookings today"
            value={12}
            compare="vs last Tuesday: 9"
          />
          <StatTile
            icon={<Calendar aria-hidden="true" />}
            label="Booked value today"
            value="$480"
          />
          <StatTile
            icon={<Calendar aria-hidden="true" />}
            label="Walk-ins today"
            value={0}
            loading
          />
        </div>
        <div className="exq-panel">
          <BarChart
            title="Bookings this week"
            nameA="This week"
            nameB="Last week"
            groups={[
              { label: 'Mon', a: 6, b: 4 },
              { label: 'Tue', a: 9, b: 7, current: true },
              { label: 'Wed', a: 3, b: 8 },
              { label: 'Thu', a: 0, b: 5 },
              { label: 'Fri', a: 0, b: 11 },
              { label: 'Sat', a: 0, b: 14 },
              { label: 'Sun', a: 0, b: 0 },
            ]}
          />
        </div>
        <Tabs
          label="Kit tabs"
          tabs={[
            { id: 'a', label: 'Profile' },
            { id: 'b', label: 'Hours', count: 2 },
          ]}
          value={tab}
          onChange={setTab}
        >
          <p>Panel {tab}</p>
        </Tabs>
        <div className="exq-panel" data-flush="true">
          <DataTable
            caption="Sample bookings"
            state="ready"
            rows={[
              { id: '1', when: 'Today 10:00 AM', who: 'Sam Rivera' },
              { id: '2', when: 'Today 11:00 AM', who: 'Pat Parker' },
            ]}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: 'When', sortable: true, render: (r) => r.when },
              { key: 'who', header: 'Client', primary: true, render: (r) => r.who },
            ]}
            sort={{ key: 'when', dir: 'asc' }}
            onSort={() => undefined}
            onOpen={() => undefined}
            empty="Nothing here"
          />
        </div>
        <div className="exq-panel" data-flush="true">
          <DataTable
            caption="Loading sample"
            state="loading"
            rows={[]}
            rowKey={() => ''}
            columns={[
              { key: 'a', header: 'When', render: () => null },
              { key: 'b', header: 'Client', render: () => null },
            ]}
            empty="Nothing here"
          />
        </div>
        <SearchBox
          label="Kit search"
          placeholder="Search name, phone or code"
          status="idle"
          groups={[
            {
              label: 'Customers',
              items: [
                {
                  key: 'x',
                  text: 'Sam Rivera',
                  title: 'Sam Rivera',
                  detail: '(215) 555-0142, 3 visits',
                },
              ],
            },
          ]}
          onQuery={() => undefined}
          onChoose={() => undefined}
        />
        <p>
          <span className="exq-status-chip" data-tone="ok">
            Done
          </span>{' '}
          <span className="exq-status-chip" data-tone="accent">
            No show
          </span>{' '}
          <span className="exq-status-chip">Confirmed</span>{' '}
          <IconButton label="Copy manage link" icon={<Copy01 aria-hidden="true" />} />
        </p>
        <PinPad label="Enter your PIN" onComplete={() => undefined} />
      </section>

      <section className="exq-kit__block" aria-label="Barber prices">
        <h2>Barber prices</h2>
        <p className="exq-muted">
          A barber&apos;s own price and time for a service. Empty means the shop&apos;s. The first
          editor starts with two entries saved and Save off; change a field to turn it on, type a
          letter in a price to see the field error, press Save to see it work. The second one is
          refused by the server. The third has no services to price.
        </p>
        <div className="exq-panel">
          <PriceOverrideEditor
            staffName="Dontrise"
            services={PRICE_SERVICES}
            saved={PRICE_SAVED}
            onSave={async () => {
              await new Promise((resolve) => setTimeout(resolve, 900));
              toast({ text: 'Prices saved.', tone: 'ok' });
            }}
          />
        </div>
        <div className="exq-panel">
          <PriceOverrideEditor
            staffName="Dontrise"
            services={PRICE_SERVICES.slice(0, 1)}
            saved={[]}
            onSave={() => Promise.reject(new Error('The prices were not saved. Try again.'))}
          />
        </div>
        <div className="exq-panel">
          <PriceOverrideEditor
            staffName="Dontrise"
            services={[]}
            saved={[]}
            onSave={() => Promise.resolve()}
            onChooseServices={() => undefined}
          />
        </div>
      </section>

      <section className="exq-kit__block" aria-label="Reviews">
        <h2>Reviews</h2>
        <p className="exq-muted">
          The rating line with a rating, then with only the place id (the links alone). The cards: a
          dated Google review, an undated theCut one and a long one. Below, the Website, Reviews
          editor: change the rating to see Save turn on, type a letter to see the field error, hide
          or move a review to see it save. The second editor is refused by the server; the third has
          no reviews and the section off.
        </p>
        <RatingLine google={GOOGLE} />
        <RatingLine google={GOOGLE_UNRATED} />
        <ReviewList reviews={REVIEW_CARDS} />
        <div className="exq-panel">
          <ReviewsEditor
            enabled
            google={GOOGLE}
            items={REVIEWS}
            staffNames={{ ['4'.repeat(24)]: 'Nelly Cutz', ['5'.repeat(24)]: 'Dontrise' }}
            onSave={async (_change, done) => {
              await new Promise((resolve) => setTimeout(resolve, 900));
              toast({ text: done, tone: 'ok' });
            }}
          />
        </div>
        <div className="exq-panel">
          <ReviewsEditor
            enabled
            google={GOOGLE}
            items={REVIEWS.slice(0, 1)}
            onSave={() => Promise.reject(new Error('The reviews were not saved. Try again.'))}
          />
        </div>
        <div className="exq-panel">
          <ReviewsEditor
            enabled={false}
            google={GOOGLE_UNRATED}
            items={[]}
            onSave={() => Promise.resolve()}
          />
        </div>
      </section>

      <section className="exq-kit__block" aria-label="Motion">
        <h2>Motion</h2>
        <Reveal className="exq-card" data-pad="md">
          This card reveals once when it scrolls into view.
        </Reveal>
        <div className="exq-dark exq-kit__ink">
          <Lines
            mode="scroll"
            lines={[{ text: 'Your chair' }, { text: 'is ready.', accent: true }]}
          />
        </div>
      </section>
    </div>
  );
}

/** Every kit component in every state, in both themes. Development builds only. */
export default function KitPage() {
  usePageTitle('Kit');
  return (
    <article className="exq-kit" data-state="ready">
      <div className="exq-wrap exq-kit__intro">
        <Label>Kit</Label>
        <h1>Components</h1>
        <p className="exq-muted">
          Light on the left, dark on the right (stacked on a phone). Development builds only.
        </p>
      </div>
      <div className="exq-kit__panels">
        <div data-theme="light" className="exq-kit__panel" aria-label="Light theme">
          <Specimen />
        </div>
        <div data-theme="dark" className="exq-kit__panel" aria-label="Dark theme">
          <Specimen />
        </div>
      </div>
    </article>
  );
}
