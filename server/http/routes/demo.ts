import { assertDemoEnabled } from '../../services/demo';
import { resetDemo } from '../../services/bootstrap';
import { NO_STORE } from '../context';
import type { RouteDefinition } from '../types';

/** Showcase mode only. With DEMO_MODE off the router never matches these, so they answer 404. */
export const demoRoutes: RouteDefinition[] = [
  {
    // Settings, "Reset demo data": wipes the shop and loads the sample data again.
    method: 'POST',
    path: '/api/admin/demo/reset',
    auth: 'owner',
    demoOnly: true,
    handler: async (ctx) => {
      assertDemoEnabled();
      await resetDemo(ctx.now);
      return { body: { ok: true }, headers: NO_STORE };
    },
  },
];
