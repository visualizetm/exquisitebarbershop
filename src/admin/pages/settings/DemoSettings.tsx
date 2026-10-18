import { useState } from 'react';
import { okResponseSchema } from '@shared/api/auth';
import { Button, Sheet } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { ErrorNote } from '../../components/ErrorNote';

/** Demo mode only: start the showcase over with the sample data. */
export function DemoSettings() {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function reset() {
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/admin/demo/reset', okResponseSchema, { method: 'POST', body: {} });
      // Every screen holds data that no longer exists, so start from a clean load.
      window.location.assign('/admin');
    } catch (err) {
      setError(err);
      setWorking(false);
    }
  }

  return (
    <section className="exq-adm-settings__demo" aria-labelledby="exq-adm-demo-title">
      <h2 id="exq-adm-demo-title">Demo data</h2>
      <p>
        This is a showcase. Everything here is sample data: the shop, the chairs, the services and
        the bookings. Change anything you like.
      </p>
      <p>
        Reset demo data wipes all of it, including photos and any logins you added, and loads the
        sample shop again from scratch. You stay signed in.
      </p>
      <ErrorNote error={error} />
      <Button
        variant="outline"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Reset demo data
      </Button>
      <Sheet
        open={confirming}
        title="Reset demo data?"
        onClose={() => {
          setConfirming(false);
        }}
      >
        <p>Bookings, photos and every change you made are replaced with the sample data.</p>
        <p className="exq-adm-photos__actions">
          <Button loading={working} onClick={() => void reset()}>
            Reset it
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setConfirming(false);
            }}
          >
            Keep it
          </Button>
        </p>
      </Sheet>
    </section>
  );
}
