import { useState } from 'react';
import { okResponseSchema } from '@shared/api/auth';
import type { AdminStaffView } from '@shared/api/admin';
import {
  setupLinkResponseSchema,
  staffAccessResponseSchema,
  type SetupLinkResponse,
} from '@shared/api/team';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { shopDateTime } from '../format';

/**
 * How a barber gets into /team. The owner makes a one-time link and sends it; the barber picks
 * their own PIN, which the owner never sees. A new link doubles as "Reset PIN": the old PIN stops
 * working and the barber is signed out everywhere.
 */
export function AccessTab({ member }: { member: AdminStaffView }) {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const access = useApi(`/api/admin/staff/${member.id}/access`, staffAccessResponseSchema, {
    version,
  });
  const [link, setLink] = useState<SetupLinkResponse | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [working, setWorking] = useState<'link' | 'unlock' | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function makeLink(copy: boolean) {
    setWorking('link');
    setError(null);
    try {
      const made = await apiRequest(
        `/api/admin/staff/${member.id}/setup-link`,
        setupLinkResponseSchema,
        { method: 'POST', body: {} },
      );
      setLink(made);
      setConfirmReset(false);
      setVersion((v) => v + 1);
      let copied = false;
      if (copy) {
        try {
          await navigator.clipboard.writeText(made.url);
          copied = true;
        } catch {
          copied = false;
        }
      }
      toast({
        text: copied
          ? `Setup link copied. Send it to ${member.name}; it works once for 72 hours.`
          : `Setup link ready below. Send it to ${member.name}; it works once for 72 hours.`,
        tone: 'ok',
        duration: 7000,
      });
    } catch (err) {
      setError(err);
    } finally {
      setWorking(null);
    }
  }

  async function unlock() {
    setWorking('unlock');
    setError(null);
    try {
      await apiRequest(`/api/admin/staff/${member.id}/unlock`, okResponseSchema, {
        method: 'POST',
        body: {},
      });
      setVersion((v) => v + 1);
      toast({ text: `${member.name} can try again now.`, tone: 'ok' });
    } catch (err) {
      setError(err);
    } finally {
      setWorking(null);
    }
  }

  if (access.status === 'loading') return <Status state="loading" />;
  if (access.status === 'error') return <Status state="error" />;
  const a = access.data;
  return (
    <div className="exq-tabbody">
      <dl className="exq-settings__facts">
        <dt>Sign in</dt>
        <dd>
          {a.hasPin
            ? 'PIN set'
            : a.setupLinkActive
              ? 'Waiting for the barber to use the link'
              : 'No PIN yet'}
        </dd>
        <dt>Last sign in</dt>
        <dd>{a.lastSignInAt ? shopDateTime(a.lastSignInAt) : 'Never'}</dd>
        {a.lockedUntil ? (
          <>
            <dt>Locked</dt>
            <dd>Until {shopDateTime(a.lockedUntil)}, after 5 wrong tries.</dd>
          </>
        ) : null}
      </dl>
      <p className="exq-muted">
        Barbers sign in at one shared address, /team: tap a name, then a 6 digit PIN. You never see
        the PIN.
      </p>
      <div className="exq-panelbody__row">
        <Button
          loading={working === 'link'}
          disabled={a.hasPin}
          onClick={() => void makeLink(true)}
        >
          Copy setup link
        </Button>
        <Button
          variant="outline"
          disabled={!a.hasPin && !a.setupLinkActive}
          onClick={() => {
            setConfirmReset(true);
          }}
        >
          Reset PIN
        </Button>
        {a.lockedUntil ? (
          <Button variant="outline" loading={working === 'unlock'} onClick={() => void unlock()}>
            Unlock
          </Button>
        ) : null}
      </div>
      {link ? (
        <Input
          label="Setup link"
          hint={`Works once, until ${shopDateTime(link.expiresAt)}.`}
          readOnly
          value={link.url}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
      ) : null}
      <ErrorNote error={error} />
      <Modal
        open={confirmReset}
        title={`Reset ${member.name}'s PIN?`}
        onClose={() => {
          setConfirmReset(false);
        }}
      >
        <div className="exq-panelbody">
          <p>
            The current PIN stops working and {member.name} is signed out on every phone. You get a
            new setup link to send.
          </p>
          <div className="exq-panelbody__row">
            <Button
              variant="accent"
              loading={working === 'link'}
              onClick={() => void makeLink(true)}
            >
              Reset and copy link
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmReset(false);
              }}
            >
              Keep the PIN
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
