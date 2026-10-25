import { useEffect, useState } from 'react';
import { settingsResponseSchema, staffListResponseSchema } from '@shared/api/admin';
import { ErrorState, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ReviewsEditor } from './ReviewsEditor';

type Settings = ReturnType<typeof settingsResponseSchema.parse>['settings'];

/**
 * The Reviews tab of Website. Loads the settings, hands the reviews and the Google rating to the
 * editor, saves each change through `PUT /api/admin/reviews` and shows a toast. Owner only.
 */
export function ReviewsPanel() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Only for the "about Drew" line under a review; the panel works without it.
  const staff = useApi('/api/admin/staff', staffListResponseSchema);

  useEffect(() => {
    let live = true;
    apiRequest('/api/admin/settings', settingsResponseSchema, { fresh: true })
      .then((res) => {
        if (live) setSettings(res.settings);
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (loadError) {
    return (
      <ErrorState title="The reviews did not load">
        Check the connection and reload the page.
      </ErrorState>
    );
  }
  if (!settings) return <Status state="loading" message="Loading the reviews" />;

  const staffNames =
    staff.status === 'ready'
      ? Object.fromEntries(staff.data.staff.map((s) => [s.id, s.name]))
      : undefined;

  return (
    <div className="exq-tabbody exq-tabbody--wide">
      <ReviewsEditor
        enabled={settings.reviews.enabled}
        google={settings.google}
        items={settings.reviews.items}
        {...(staffNames ? { staffNames } : {})}
        onSave={async (change, done) => {
          const res = await apiRequest('/api/admin/reviews', settingsResponseSchema, {
            method: 'PUT',
            body: change,
          });
          setSettings(res.settings);
          toast({ text: done, tone: 'ok' });
        }}
      />
    </div>
  );
}
