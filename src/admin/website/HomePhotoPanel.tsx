import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { adminPhotoListResponseSchema } from '@shared/api/photos';
import { okResponseSchema } from '@shared/api/auth';
import { Button, EmptyState, ErrorState, Input, PhotoFrame, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { uploadPhoto, type UploadPhase } from '../lib/uploadPhoto';
import { useMe } from '../useSession';

/**
 * The big photo on the home page. Upload a new one and it replaces the old one right away. The
 * two previews show the same 4:5 crop the home page uses, at the sizes of a phone and a computer,
 * so the owner sees what gets cut before anyone else does.
 */
export function HomePhotoPanel() {
  const toast = useToast();
  const me = useMe();
  const [version, setVersion] = useState(0);
  const list = useApi(
    me.features.photos ? '/api/admin/photos?kind=hero' : null,
    adminPhotoListResponseSchema,
    { version },
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [fraction, setFraction] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);

  if (!me.features.photos) {
    return (
      <EmptyState title="Photo storage isn't set up yet.">
        Photos can be added once it's connected.
      </EmptyState>
    );
  }
  if (list.status === 'error')
    return (
      <ErrorState title="The photo did not load">
        Check the connection and reload the page.
      </ErrorState>
    );
  const current = list.status === 'ready' ? (list.data.photos[0] ?? null) : null;
  const shown = preview
    ? { url: preview, width: 800, height: 1000, alt: alt || 'New home photo' }
    : current
      ? {
          url: current.url,
          width: current.width,
          height: current.height,
          alt: current.alt,
          delivery: current.delivery ?? null,
        }
      : null;

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function replace() {
    if (!file || !alt.trim()) return;
    setError(null);
    try {
      const older = list.status === 'ready' ? list.data.photos : [];
      await uploadPhoto(file, { kind: 'hero', alt }, (p, f) => {
        setPhase(p);
        setFraction(f ?? 0);
      });
      // The new photo goes first (it is newest); the old ones come off the site.
      for (const old of older) {
        await apiRequest(`/api/admin/photos/${old.id}`, okResponseSchema, { method: 'DELETE' });
      }
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview(null);
      setAlt('');
      if (input.current) input.current.value = '';
      setVersion((v) => v + 1);
      toast({ text: 'Home photo replaced. The site shows it right away.', tone: 'ok' });
    } catch (err) {
      setError(err);
    } finally {
      setPhase(null);
    }
  }

  return (
    <div className="exq-tabbody exq-tabbody--wide">
      <div className="exq-homephoto">
        <figure className="exq-homephoto__preview" data-device="phone">
          <figcaption>On a phone</figcaption>
          <PhotoFrame photo={shown} name="The shop" ratio="4:5" sizes="240px" />
        </figure>
        <figure className="exq-homephoto__preview" data-device="desktop">
          <figcaption>On a computer</figcaption>
          <PhotoFrame photo={shown} name="The shop" ratio="4:5" sizes="320px" />
        </figure>
      </div>
      {preview ? (
        <p className="exq-muted">
          This is the new photo as it will look. Describe it and save to put it on the site.
        </p>
      ) : null}

      <form
        className="exq-panelbody"
        onSubmit={(e) => {
          e.preventDefault();
          void replace();
        }}
      >
        <div className="exq-field" data-state="default">
          <label className="exq-field__label" htmlFor="exq-home-photo-file">
            {current ? 'Choose a new photo' : 'Choose a photo'}
          </label>
          <span className="exq-field__hint">
            Looks best with the person off to one side. JPEG, PNG or WebP, resized on your device
            before it is sent.
          </span>
          <input
            ref={input}
            id="exq-home-photo-file"
            className="exq-field__control"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={phase !== null}
            onChange={pick}
          />
        </div>
        <Input
          label="Describe the photo (alt text)"
          hint="Read aloud by screen readers."
          required
          maxLength={200}
          value={alt}
          disabled={phase !== null}
          onChange={(e) => {
            setAlt(e.target.value);
          }}
        />
        {phase === 'uploading' ? (
          <progress
            className="exq-adm-photos__progress"
            value={Math.round(fraction * 100)}
            max={100}
            aria-label="Upload progress"
          />
        ) : null}
        <ErrorNote error={error} />
        <div className="exq-panelbody__row">
          <Button type="submit" loading={phase !== null} disabled={!file || !alt.trim()}>
            {current ? 'Replace home photo' : 'Add home photo'}
          </Button>
        </div>
      </form>
    </div>
  );
}
