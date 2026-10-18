/** Shown on the admin sign-in page and across the admin while DEMO_MODE is on. */
export function DemoBanner() {
  return (
    <p className="exq-demo-banner" role="note" data-state="demo">
      Demo mode. Sample data, resets anytime.
    </p>
  );
}
