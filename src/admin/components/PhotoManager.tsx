import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import ArrowDown from '@untitled-ui/icons-react/build/esm/ArrowDown';
import ArrowUp from '@untitled-ui/icons-react/build/esm/ArrowUp';
import Trash01 from '@untitled-ui/icons-react/build/esm/Trash01';
import {
  adminPhotoListResponseSchema,
  adminPhotoResponseSchema,
  type AdminPhotoView,
} from '@shared/api/photos';
import { okResponseSchema } from '@shared/api/auth';
import type { PhotoKind } from '@shared/schemas/photo';
import { Button, EmptyState, Input, Sheet, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { uploadPhoto } from '../lib/uploadPhoto';
import { ErrorNote } from './ErrorNote';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'preparing' }
  | { phase: 'uploading'; fraction: number }
  | { phase: 'confirming' };

/**
 * Upload, caption, reorder and remove the photos of one kind (and chair). The
 * browser resizes and re-encodes before the bytes leave the device, the server
 * hands out the key and checks the object on confirm.
 */
export function PhotoManager({
  kind,
  staffId,
  title,
}: {
  kind: PhotoKind;
  staffId?: string | undefined;
  title: string;
}) {
  const toast = useToast();
  const query = new URLSearchParams({ kind });
  if (staffId) query.set('staffId', staffId);
  const [version, setVersion] = useState(0);
  const list = useApi(`/api/admin/photos?${query.toString()}`, adminPhotoListResponseSchema, {
    version,
  });
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const [error, setError] = useState<unknown>(null);
  const [removing, setRemoving] = useState<AdminPhotoView | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = () => {
    setVersion((v) => v + 1);
  };

  async function send() {
    if (!file || !alt.trim()) return;
    setError(null);
    try {
      await uploadPhoto(file, { kind, staffId, alt }, (phase, fraction) => {
        setUpload(phase === 'uploading' ? { phase, fraction: fraction ?? 0 } : { phase });
      });
      setFile(null);
      setAlt('');
      if (fileInput.current) fileInput.current.value = '';
      toast({ text: 'Photo added.', tone: 'ok' });
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setUpload({ phase: 'idle' });
    }
  }

  async function patch(photo: AdminPhotoView, body: { alt?: string; sortOrder?: number }) {
    setError(null);
    try {
      await apiRequest(`/api/admin/photos/${photo.id}`, adminPhotoResponseSchema, {
        method: 'PATCH',
        body,
      });
      refresh();
    } catch (err) {
      setError(err);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const photos = list.status === 'ready' ? list.data.photos : [];
    const a = photos[index];
    const b = photos[index + direction];
    if (!a || !b) return;
    // Swap the two orders; equal orders are split so the move always takes.
    const orderA =
      b.sortOrder === a.sortOrder ? b.sortOrder + (direction > 0 ? 1 : -1) : b.sortOrder;
    await patch(a, { sortOrder: Math.max(0, orderA) });
    await patch(b, { sortOrder: a.sortOrder });
  }

  async function remove(photo: AdminPhotoView) {
    setError(null);
    try {
      await apiRequest(`/api/admin/photos/${photo.id}`, okResponseSchema, { method: 'DELETE' });
      setRemoving(null);
      toast({ text: 'Photo removed.', tone: 'ok' });
      refresh();
    } catch (err) {
      setError(err);
    }
  }

  const busy = upload.phase !== 'idle';
  const photos = list.status === 'ready' ? list.data.photos : [];

  return (
    <section className="exq-adm-photos" data-state={upload.phase} aria-label={title}>
      <form
        className="exq-adm-photos__upload"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="exq-field" data-state="default">
          <label
            className="exq-field__label"
            htmlFor={`exq-adm-photo-file-${kind}-${staffId ?? 'all'}`}
          >
            Choose a photo
          </label>
          <span className="exq-field__hint">
            JPEG, PNG or WebP. It is resized to 2000px and converted to WebP on your phone before
            upload, which also strips location data.
          </span>
          <input
            ref={fileInput}
            id={`exq-adm-photo-file-${kind}-${staffId ?? 'all'}`}
            className="exq-field__control"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </div>
        <Input
          label="Describe the photo (alt text)"
          hint="Read aloud by screen readers and shown if the image does not load."
          required
          maxLength={200}
          value={alt}
          disabled={busy}
          onChange={(e) => {
            setAlt(e.target.value);
          }}
        />
        {upload.phase === 'uploading' ? (
          <progress
            className="exq-adm-photos__progress"
            value={Math.round(upload.fraction * 100)}
            max={100}
            aria-label="Upload progress"
          />
        ) : null}
        <ErrorNote error={error} />
        <Button type="submit" loading={busy} disabled={!file || !alt.trim()}>
          {upload.phase === 'preparing'
            ? 'Preparing'
            : upload.phase === 'uploading'
              ? `Uploading ${String(Math.round(upload.fraction * 100))}%`
              : upload.phase === 'confirming'
                ? 'Saving'
                : 'Upload photo'}
        </Button>
      </form>

      {list.status === 'ready' && photos.length === 0 ? (
        <EmptyState title="No photos yet">The first one you add shows up here.</EmptyState>
      ) : null}
      <ol className="exq-adm-photos__list">
        {photos.map((photo, index) => (
          <li key={photo.id} className="exq-adm-photos__item" data-state="ready">
            <img
              className="exq-adm-photos__thumb"
              src={photo.url}
              width={photo.width}
              height={photo.height}
              alt={photo.alt}
              loading="lazy"
            />
            <div className="exq-adm-photos__body">
              <AltEditor
                photo={photo}
                onSave={(next) => {
                  void patch(photo, { alt: next });
                }}
              />
              <p className="exq-adm-photos__actions">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Move ${photo.alt} up`}
                  disabled={index === 0}
                  icon={<ArrowUp aria-hidden="true" />}
                  onClick={() => void move(index, -1)}
                >
                  Up
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Move ${photo.alt} down`}
                  disabled={index === photos.length - 1}
                  icon={<ArrowDown aria-hidden="true" />}
                  onClick={() => void move(index, 1)}
                >
                  Down
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${photo.alt}`}
                  icon={<Trash01 aria-hidden="true" />}
                  onClick={() => {
                    setRemoving(photo);
                  }}
                >
                  Remove
                </Button>
              </p>
            </div>
          </li>
        ))}
      </ol>
      <Sheet
        open={removing !== null}
        title="Remove this photo?"
        onClose={() => {
          setRemoving(null);
        }}
      >
        <p>It comes off the site right away.</p>
        <p className="exq-adm-photos__actions">
          <Button
            onClick={() => {
              if (removing) void remove(removing);
            }}
          >
            Remove it
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRemoving(null);
            }}
          >
            Keep it
          </Button>
        </p>
      </Sheet>
    </section>
  );
}

function AltEditor({ photo, onSave }: { photo: AdminPhotoView; onSave: (alt: string) => void }) {
  const [value, setValue] = useState(photo.alt);
  return (
    <form
      className="exq-adm-photos__alt"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && value.trim() !== photo.alt) onSave(value.trim());
      }}
    >
      <Input
        label="Alt text"
        value={value}
        maxLength={200}
        required
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      <Button type="submit" variant="outline" size="sm" disabled={value.trim() === photo.alt}>
        Save
      </Button>
    </form>
  );
}
