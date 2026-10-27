import { useState } from 'react';
import { z } from 'zod';
import type { SyntheticEvent } from 'react';
import {
  kioskDeviceCreateResponseSchema,
  kioskDeviceListResponseSchema,
  type KioskDeviceView,
} from '@shared/api/kiosk';
import { pinProblem } from '@shared/lib/pin';
import { Button, ErrorState, Input, Modal } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { shopDateTime } from '../format';

const okSchema = z.object({ ok: z.literal(true) });

/**
 * Settings, Check in tablets: set up a locked front desk tablet (a name and an exit PIN, answered
 * with a one-use pairing code that lives ten minutes), the list of tablets with when they were
 * paired and last seen, and Unpair, which revokes a tablet at once.
 */
export function TabletsTab() {
  const [version, setVersion] = useState(0);
  const loaded = useApi('/api/admin/kiosk/devices', kioskDeviceListResponseSchema, { version });
  const [name, setName] = useState('Front desk');
  const [exitPin, setExitPin] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const [unpairing, setUnpairing] = useState<KioskDeviceView | null>(null);
  const refresh = () => {
    setVersion((v) => v + 1);
  };

  async function setup(event: SyntheticEvent) {
    event.preventDefault();
    const problem = pinProblem(exitPin);
    if (problem) {
      setError(new Error(problem));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const made = await apiRequest('/api/admin/kiosk/devices', kioskDeviceCreateResponseSchema, {
        method: 'POST',
        body: { name, exitPin },
      });
      setCode({ name: made.device.name, code: made.code });
      setExitPin('');
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  async function unpair(device: KioskDeviceView) {
    setWorking(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/kiosk/devices/${device.id}`, okSchema, { method: 'DELETE' });
      setUnpairing(null);
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  if (loaded.status === 'error') {
    return <ErrorState title="The tablets did not load">Reload the page.</ErrorState>;
  }
  return (
    <>
      <section className="exq-settings__section" aria-labelledby="exq-set-tablet-new">
        <h2 id="exq-set-tablet-new" className="exq-h3">
          Set up a tablet
        </h2>
        <p>
          A locked tablet for the front desk: clients can walk in, check in and see who is in, and
          nothing else. Name it, pick the exit PIN you will use to leave the locked screen, then
          type the pairing code on the tablet at <strong>yoursite/checkin</strong> within ten
          minutes.
        </p>
        <form className="exq-settings__form" onSubmit={(e) => void setup(e)}>
          <Input
            label="Tablet name"
            required
            maxLength={40}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <Input
            label="Exit PIN (6 digits)"
            hint="Needed to leave the locked screen. Only you should know it."
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={exitPin}
            onChange={(e) => {
              setExitPin(e.target.value.replace(/\D/g, '').slice(0, 6));
            }}
          />
          <ErrorNote error={error} />
          <div className="exq-panelbody__row">
            <Button type="submit" loading={working}>
              Get a pairing code
            </Button>
          </div>
        </form>
      </section>
      <section className="exq-settings__section" aria-labelledby="exq-set-tablet-list">
        <h2 id="exq-set-tablet-list" className="exq-h3">
          Tablets
        </h2>
        {loaded.status !== 'ready' ? (
          <Status state="loading" />
        ) : loaded.data.devices.length === 0 ? (
          <p className="exq-muted">No tablet yet.</p>
        ) : (
          <ul className="exq-settings__tablets">
            {loaded.data.devices.map((d) => (
              <li
                key={d.id}
                className="exq-settings__tablet"
                data-state={d.paired ? 'paired' : 'waiting'}
              >
                <div>
                  <strong>{d.name}</strong>
                  <p className="exq-muted">
                    {d.paired
                      ? `Paired ${d.pairedAt ? shopDateTime(d.pairedAt) : ''}. Last seen ${d.lastSeenAt ? shopDateTime(d.lastSeenAt) : 'never'}.`
                      : d.codeExpiresAt
                        ? `Waiting for its code until ${shopDateTime(d.codeExpiresAt)}.`
                        : 'Its code has expired. Unpair it and set it up again.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setUnpairing(d);
                  }}
                >
                  Unpair
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Modal
        open={code !== null}
        title="Pairing code"
        onClose={() => {
          setCode(null);
        }}
      >
        <div className="exq-panelbody">
          <p>
            On the tablet, open <strong>yoursite/checkin</strong> and type this code. It works once
            and stops after ten minutes.
          </p>
          <p className="exq-settings__code" data-testid="pairing-code">
            {code?.code}
          </p>
          <div className="exq-panelbody__row">
            <Button
              onClick={() => {
                setCode(null);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={unpairing !== null}
        title={`Unpair ${unpairing?.name ?? ''}?`}
        onClose={() => {
          setUnpairing(null);
        }}
      >
        <div className="exq-panelbody">
          <p>The tablet goes back to its pairing screen at once. Set it up again to use it.</p>
          <ErrorNote error={error} />
          <div className="exq-panelbody__row">
            <Button
              loading={working}
              onClick={() => {
                if (unpairing) void unpair(unpairing);
              }}
            >
              Unpair it
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setUnpairing(null);
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
