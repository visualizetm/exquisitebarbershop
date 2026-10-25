import { useState } from 'react';
import { useLocation } from 'react-router';
import { publicShopSchema } from '@shared/api/public';
import { Button, Modal } from '@/components/ui';
import { useApi } from '@/lib/useApi';

const FLAG = 'exq-demo-notice-seen';

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    // Storage is blocked (a private window, a strict setting): show the notice every time.
    return false;
  }
}

function remember(): void {
  try {
    sessionStorage.setItem(FLAG, '1');
  } catch {
    // Nothing to do: the notice simply shows again on the next page load.
  }
}

/**
 * The showcase says what it is, once per browser session, before anything else can be used. Only
 * when DEMO_MODE is on: a real shop never loads this far. It is the native dialog, so the page
 * behind is inert, Tab stays inside, Escape closes it and focus returns where it was.
 * It covers the public site, /admin and /team, because it sits above the router's routes.
 */
export function DemoNotice() {
  // The setup page runs before the shop exists, so it never asks for it (nor does this).
  const { pathname } = useLocation();
  const shop = useApi(pathname === '/setup' ? null : '/api/shop', publicShopSchema);
  const [dismissed, setDismissed] = useState(false);
  // Read once, when the page loads: closing it must not depend on storage working.
  const [seenBefore] = useState(alreadySeen);
  const demo = shop.status === 'ready' && shop.data.demo === true;
  const open = demo && !dismissed && !seenBefore;

  function close() {
    remember();
    setDismissed(true);
  }

  if (!demo) return null;
  return (
    <Modal open={open} title="This is a demo" onClose={close}>
      <div className="exq-demo-notice">
        <p>
          This site is a demo built by Visualize Studio for Exquisite Barber &amp; Beauty Lounge.
          Bookings made here are not real and nothing is sent to the shop. It is a preview for
          Visualize clients.
        </p>
        <Button size="lg" onClick={close}>
          Enter the demo
        </Button>
        <p className="exq-demo-notice__about">
          <a href="https://visualizestudio.org" target="_blank" rel="noopener noreferrer">
            visualizestudio.org
          </a>
        </p>
      </div>
    </Modal>
  );
}
