import { useState } from 'react';
import {
  Button,
  ButtonLink,
  Card,
  ChairCard,
  ChairCardSkeleton,
  Chip,
  Chips,
  EmptyState,
  ErrorState,
  Input,
  PhotoArch,
  Select,
  Sheet,
  StepBar,
  Textarea,
  Ticket,
  TimeChip,
  useToast,
} from '@/components/ui';
import { usePageTitle } from '@/lib/usePageTitle';

const STEPS = [
  { key: 'services', label: 'Services' },
  { key: 'barber', label: 'Chair' },
  { key: 'day', label: 'Day' },
  { key: 'time', label: 'Time' },
  { key: 'details', label: 'Details' },
] as const;

/** Every kit component in every state, on one page. Development builds only. */
export default function KitPage() {
  usePageTitle('Kit');
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [chip, setChip] = useState('all');
  const [time, setTime] = useState('10:00');
  return (
    <article className="exq-wrap exq-section exq-kit" data-state="ready">
      <p className="exq-label">Kit</p>
      <h1>Components</h1>

      <section className="exq-section">
        <h2>Buttons</h2>
        <div className="exq-chips" style={{ marginTop: 16 }}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button pressed>Pressed</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <ButtonLink to="/book" size="lg">
            Large link
          </ButtonLink>
          <Button size="sm" variant="secondary">
            Small
          </Button>
        </div>
        <div className="exq-dark exq-band" style={{ padding: 16, marginTop: 16, borderRadius: 16 }}>
          <Button variant="inverse">Ink inverse</Button>
        </div>
      </section>

      <section className="exq-section">
        <h2>Fields</h2>
        <div className="exq-grid" data-md="2" style={{ marginTop: 16 }}>
          <Input label="Name" placeholder="Your name" autoComplete="name" />
          <Input
            label="Phone"
            type="tel"
            error="Enter a valid US phone number"
            defaultValue="123"
          />
          <Input label="Email" type="email" warning="We could not verify this address" />
          <Select label="Chair" hint="First available picks the least booked chair">
            <option>First available</option>
            <option>Marcus</option>
          </Select>
          <Textarea label="Notes" placeholder="Anything we should know?" />
        </div>
      </section>

      <section className="exq-section">
        <h2>Chips</h2>
        <Chips label="Groups">
          <Chip
            selected={chip === 'all'}
            count={13}
            onClick={() => {
              setChip('all');
            }}
          >
            All
          </Chip>
          <Chip
            selected={chip === 'barber'}
            count={8}
            onClick={() => {
              setChip('barber');
            }}
          >
            Barber
          </Chip>
          <Chip
            selected={chip === 'beauty'}
            count={5}
            onClick={() => {
              setChip('beauty');
            }}
          >
            Beauty
          </Chip>
          <Chip disabled count={0}>
            Nails
          </Chip>
        </Chips>
        <h3 style={{ marginTop: 24 }}>Time chips</h3>
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

      <section className="exq-section">
        <h2>Steps</h2>
        <StepBar steps={STEPS} current="day" onJump={() => undefined} />
      </section>

      <section className="exq-section">
        <h2>Chair cards</h2>
        <div className="exq-grid" data-cols="2" data-lg="4" style={{ marginTop: 16 }}>
          <ChairCard
            name="Marcus Reed"
            specialty="Fades and designs"
            chairNumber={2}
            photo={null}
            status="next-open"
            statusLabel="Next open 2:15 PM"
            to="/book?barber=marcus"
          />
          <ChairCard
            name="Dee Carter"
            specialty="Silk press and braids"
            chairNumber={3}
            photo={null}
            status="off"
            statusLabel="Off today"
            to="/book?barber=dee"
          />
          <ChairCard
            name="Tre Lewis"
            chairNumber={4}
            photo={null}
            status="closed"
            statusLabel="Closed today"
          />
          <ChairCardSkeleton />
        </div>
        <div style={{ maxWidth: 200, marginTop: 16 }}>
          <PhotoArch photo={null} name="Jay Q" tone="ink" />
        </div>
      </section>

      <section className="exq-section">
        <h2>Card, states, sheet, toast</h2>
        <div className="exq-grid" data-md="2" style={{ marginTop: 16 }}>
          <Card>
            <h3>A card</h3>
            <p className="exq-muted">Bordered, soft shadow in light, none in dark.</p>
          </Card>
          <Card interactive>
            <h3>Interactive</h3>
            <p className="exq-muted">Brightens on hover, never moves.</p>
          </Card>
          <EmptyState
            title="No photos yet"
            action={<ButtonLink to="/gallery">See the gallery</ButtonLink>}
          >
            Follow the shop on Instagram for the latest work.
          </EmptyState>
          <ErrorState action={<Button variant="secondary">Try again</Button>}>
            We could not load the schedule.
          </ErrorState>
        </div>
        <div className="exq-chips" style={{ marginTop: 16 }}>
          <Button
            variant="secondary"
            onClick={() => {
              setSheet(true);
            }}
          >
            Open a sheet
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast({
                text: 'Marked completed.',
                tone: 'ok',
                action: { label: 'Undo', onClick: () => undefined },
              });
            }}
          >
            Show a toast
          </Button>
        </div>
        <Sheet
          open={sheet}
          title="Cancel this booking?"
          onClose={() => {
            setSheet(false);
          }}
        >
          <p>You can book again any time.</p>
          <div className="exq-chips" style={{ marginTop: 16 }}>
            <Button
              onClick={() => {
                setSheet(false);
              }}
            >
              Yes, cancel it
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSheet(false);
              }}
            >
              Keep it
            </Button>
          </div>
        </Sheet>
      </section>

      <section className="exq-section">
        <h2>Ticket</h2>
        <div style={{ maxWidth: 480, marginTop: 16 }}>
          <Ticket
            code="KZT-7MQ4"
            rows={[
              { label: 'Chair', value: 'Chair 02, Marcus Reed' },
              { label: 'When', value: 'Thu, Oct 23, 2:15 PM' },
              { label: 'Services', value: 'Classic Cut' },
            ]}
            total="$30"
            actions={
              <>
                <Button variant="secondary" size="sm">
                  Add to calendar
                </Button>
                <Button variant="secondary" size="sm">
                  Manage this booking
                </Button>
              </>
            }
          />
        </div>
      </section>
    </article>
  );
}
