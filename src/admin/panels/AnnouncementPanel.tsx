import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { settingsResponseSchema } from '@shared/api/admin';
import type { Announcement } from '@shared/schemas/shopSettings';
import { Button, Checkbox, Input, TopStrip, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { ErrorNote } from '../components/ErrorNote';
import { useQuick } from '../shell/quick';

const MAX = 90;

/**
 * The line in the thin strip above every public page: up to 90 characters, an optional link, an
 * On/Off switch and an optional last day. Saving changes the site right away. Shared by the
 * Overview quick action and the Website page.
 */
export function AnnouncementPanel({ onDone }: { onDone?: (() => void) | undefined }) {
  const quick = useQuick();
  const toast = useToast();
  const [loaded, setLoaded] = useState<{
    settings: ReturnType<typeof settingsResponseSchema.parse>['settings'];
  } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Announcement | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let live = true;
    apiRequest('/api/admin/settings', settingsResponseSchema, { fresh: true })
      .then((res) => {
        if (!live) return;
        setLoaded(res);
        setDraft(res.settings.announcement);
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (loadError) return <Status state="error" />;
  if (!loaded || !draft) return <Status state="loading" />;

  const set = <K extends keyof Announcement>(key: K, value: Announcement[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    if (!loaded || !draft) return;
    setWorking(true);
    setError(null);
    try {
      const res = await apiRequest('/api/admin/settings', settingsResponseSchema, {
        method: 'PUT',
        body: { ...loaded.settings, announcement: draft },
      });
      setLoaded(res);
      quick.changed();
      toast({
        text: draft.enabled
          ? 'Announcement saved. It is live on the site.'
          : 'Announcement saved and switched off.',
        tone: 'ok',
      });
      onDone?.();
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className="exq-panelbody" onSubmit={(e) => void save(e)}>
      <div className="exq-announce-preview" inert>
        <TopStrip
          announcement={{ ...draft, enabled: true, text: draft.text || 'Your announcement' }}
          loading={false}
        />
      </div>
      <Checkbox
        label="Show the announcement on the site"
        checked={draft.enabled}
        onChange={(e) => {
          set('enabled', e.target.checked);
        }}
      />
      <Input
        label="Text"
        hint={`${draft.text.length} of ${MAX} characters`}
        maxLength={MAX}
        value={draft.text}
        onChange={(e) => {
          set('text', e.target.value);
        }}
      />
      <div className="exq-panelbody__row">
        <Input
          label="Link label (optional)"
          maxLength={30}
          value={draft.linkLabel}
          onChange={(e) => {
            set('linkLabel', e.target.value);
          }}
        />
        <Input
          label="Link address"
          hint="/book or an https address"
          maxLength={200}
          value={draft.linkUrl}
          onChange={(e) => {
            set('linkUrl', e.target.value);
          }}
        />
      </div>
      <Input
        label="Last day it shows (optional)"
        hint="After this day it switches itself off."
        type="date"
        value={draft.endsOn}
        onChange={(e) => {
          set('endsOn', e.target.value);
        }}
      />
      <ErrorNote error={error} />
      <div className="exq-panelbody__row">
        <Button type="submit" loading={working}>
          Save announcement
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            window.open('/', '_blank', 'noopener');
          }}
        >
          View on site
        </Button>
      </div>
    </form>
  );
}
