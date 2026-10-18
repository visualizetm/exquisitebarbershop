import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import ArrowDown from '@untitled-ui/icons-react/build/esm/ArrowDown';
import ArrowUp from '@untitled-ui/icons-react/build/esm/ArrowUp';
import DotsGrid from '@untitled-ui/icons-react/build/esm/DotsGrid';
import Trash01 from '@untitled-ui/icons-react/build/esm/Trash01';
import { staffListResponseSchema } from '@shared/api/admin';
import {
  adminPhotoListResponseSchema,
  adminPhotoResponseSchema,
  type AdminPhotoView,
} from '@shared/api/photos';
import { okResponseSchema } from '@shared/api/auth';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  Select,
  useToast,
} from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { uploadPhoto } from '../lib/uploadPhoto';
import { useMe } from '../useSession';

interface Draft {
  key: string;
  file: File;
  url: string;
  alt: string;
  staffId: string;
  status: 'waiting' | 'working' | 'done' | 'failed';
  note: string;
}

/**
 * The gallery: pick several photos at once, give each one its alt text and the barber whose work it
 * is, then upload them. Below, every photo can be re-captioned, re-credited, dragged (or moved with
 * the arrows) into order, or removed. Alt text is required for every photo.
 */
export function GalleryPanel() {
  const me = useMe();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const list = useApi(
    me.features.photos ? '/api/admin/photos?kind=gallery' : null,
    adminPhotoListResponseSchema,
    { version },
  );
  const staff = useApi(me.features.photos ? '/api/admin/staff' : null, staffListResponseSchema);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminPhotoView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  useEffect(
    () => () => {
      for (const d of draftsRef.current) URL.revokeObjectURL(d.url);
    },
    [],
  );

  if (!me.features.photos) {
    return (
      <EmptyState title="Photo storage isn't set up yet.">
        Photos can be added once it's connected.
      </EmptyState>
    );
  }
  if (list.status === 'error')
    return (
      <ErrorState title="The gallery did not load">
        Check the connection and reload the page.
      </ErrorState>
    );
  const chairs = staff.status === 'ready' ? staff.data.staff.filter((s) => !s.deletedAt) : [];
  const photos = list.status === 'ready' ? list.data.photos : [];
  const shown = order
    ? order
        .map((id) => photos.find((p) => p.id === id))
        .filter((p): p is AdminPhotoView => p !== undefined)
    : photos;

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    setDrafts((prev) => [
      ...prev,
      ...files.map((file, i) => ({
        key: `${String(Date.now())}-${String(i)}-${file.name}`,
        file,
        url: URL.createObjectURL(file),
        alt: '',
        staffId: '',
        status: 'waiting' as const,
        note: '',
      })),
    ]);
    if (input.current) input.current.value = '';
  }
  const patchDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  async function uploadAll() {
    setUploading(true);
    setError(null);
    let added = 0;
    for (const d of draftsRef.current.filter((x) => x.status !== 'done')) {
      patchDraft(d.key, { status: 'working', note: 'Preparing' });
      try {
        const photo = await uploadPhoto(d.file, { kind: 'gallery', alt: d.alt }, (phase, f) => {
          patchDraft(d.key, {
            note:
              phase === 'uploading'
                ? `Uploading ${String(Math.round((f ?? 0) * 100))}%`
                : phase === 'confirming'
                  ? 'Saving'
                  : 'Preparing',
          });
        });
        if (d.staffId) {
          await apiRequest(`/api/admin/photos/${photo.id}`, adminPhotoResponseSchema, {
            method: 'PATCH',
            body: { staffId: d.staffId },
          });
        }
        patchDraft(d.key, { status: 'done', note: 'Added' });
        added += 1;
      } catch (err) {
        patchDraft(d.key, {
          status: 'failed',
          note: err instanceof Error ? err.message : 'It did not upload',
        });
      }
    }
    setUploading(false);
    setVersion((v) => v + 1);
    if (added > 0)
      toast({
        text: `${String(added)} ${added === 1 ? 'photo' : 'photos'} added to the gallery.`,
        tone: 'ok',
      });
    setDrafts((prev) => {
      for (const d of prev.filter((x) => x.status === 'done')) URL.revokeObjectURL(d.url);
      return prev.filter((x) => x.status !== 'done');
    });
  }

  async function patch(
    photo: AdminPhotoView,
    body: { alt?: string; sortOrder?: number; staffId?: string | null },
  ) {
    setError(null);
    try {
      await apiRequest(`/api/admin/photos/${photo.id}`, adminPhotoResponseSchema, {
        method: 'PATCH',
        body,
      });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err);
    }
  }

  async function persist(ids: string[]) {
    setError(null);
    try {
      for (const [index, id] of ids.entries()) {
        const p = photos.find((x) => x.id === id);
        if (p && p.sortOrder !== index) {
          await apiRequest(`/api/admin/photos/${id}`, adminPhotoResponseSchema, {
            method: 'PATCH',
            body: { sortOrder: index },
          });
        }
      }
      toast({ text: 'Order saved.', tone: 'ok' });
    } catch (err) {
      setError(err);
    } finally {
      setOrder(null);
      setVersion((v) => v + 1);
    }
  }
  function moveTo(id: string, target: number) {
    const ids = shown.map((p) => p.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, target)), 0, id);
    setOrder(ids);
    return ids;
  }

  async function remove(photo: AdminPhotoView) {
    try {
      await apiRequest(`/api/admin/photos/${photo.id}`, okResponseSchema, { method: 'DELETE' });
      setRemoving(null);
      setVersion((v) => v + 1);
      toast({ text: 'Photo removed from the gallery.', tone: 'ok' });
    } catch (err) {
      setError(err);
    }
  }

  const ready =
    drafts.length > 0 && drafts.every((d) => d.alt.trim() !== '' || d.status === 'done');
  return (
    <div className="exq-tabbody exq-tabbody--wide">
      <form
        className="exq-panelbody"
        onSubmit={(e) => {
          e.preventDefault();
          void uploadAll();
        }}
      >
        <div className="exq-field" data-state="default">
          <label className="exq-field__label" htmlFor="exq-gallery-files">
            Add photos
          </label>
          <span className="exq-field__hint">
            Pick as many as you like. Each one needs alt text, and can be credited to a barber.
          </span>
          <input
            ref={input}
            id="exq-gallery-files"
            className="exq-field__control"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={pick}
          />
        </div>
        {drafts.length > 0 ? (
          <ul className="exq-drafts exq-bare">
            {drafts.map((d) => (
              <li key={d.key} className="exq-draft" data-state={d.status}>
                <img className="exq-draft__thumb" src={d.url} alt="" width={72} height={72} />
                <div className="exq-draft__fields">
                  <Input
                    label={`Alt text for ${d.file.name}`}
                    required
                    maxLength={200}
                    value={d.alt}
                    disabled={uploading || d.status === 'done'}
                    onChange={(e) => {
                      patchDraft(d.key, { alt: e.target.value });
                    }}
                  />
                  <Select
                    label="Credit the work to"
                    value={d.staffId}
                    disabled={uploading || d.status === 'done'}
                    onChange={(e) => {
                      patchDraft(d.key, { staffId: e.target.value });
                    }}
                  >
                    <option value="">Nobody in particular</option>
                    {chairs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {d.note ? (
                    <p className="exq-muted" role="status">
                      {d.note}
                    </p>
                  ) : null}
                </div>
                <IconButton
                  label={`Drop ${d.file.name}`}
                  icon={<Trash01 aria-hidden="true" />}
                  disabled={uploading}
                  onClick={() => {
                    URL.revokeObjectURL(d.url);
                    setDrafts((prev) => prev.filter((x) => x.key !== d.key));
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <ErrorNote error={error} />
        <div className="exq-panelbody__row">
          <Button type="submit" loading={uploading} disabled={!ready}>
            {drafts.length > 1 ? `Upload ${String(drafts.length)} photos` : 'Upload photo'}
          </Button>
        </div>
      </form>

      {list.status === 'loading' || staff.status === 'loading' ? (
        <Status state="loading" />
      ) : shown.length === 0 ? (
        <EmptyState title="No gallery photos yet">
          The first ones you add show here and on the site.
        </EmptyState>
      ) : (
        <ol
          className="exq-gallerylist exq-bare"
          aria-label="Gallery photos, in the order the site shows them"
        >
          {shown.map((p, index) => (
            <li
              key={p.id}
              className="exq-gphoto"
              data-dragging={dragging === p.id ? 'true' : 'false'}
              draggable
              onDragStart={() => {
                setDragging(p.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragging && dragging !== p.id) moveTo(dragging, index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (order) void persist(order);
                setDragging(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                if (order) void persist(order);
              }}
            >
              <span className="exq-svc__grip" aria-hidden="true">
                <DotsGrid width={18} height={18} />
              </span>
              <img
                className="exq-draft__thumb"
                src={p.url}
                alt=""
                width={72}
                height={72}
                loading="lazy"
              />
              <GalleryFields
                photo={p}
                chairs={chairs}
                onSave={(body) => {
                  void patch(p, body);
                }}
              />
              <div className="exq-svc__actions">
                <IconButton
                  label={`Move ${p.alt} up`}
                  icon={<ArrowUp aria-hidden="true" />}
                  disabled={index === 0}
                  onClick={() => {
                    void persist(moveTo(p.id, index - 1));
                  }}
                />
                <IconButton
                  label={`Move ${p.alt} down`}
                  icon={<ArrowDown aria-hidden="true" />}
                  disabled={index === shown.length - 1}
                  onClick={() => {
                    void persist(moveTo(p.id, index + 1));
                  }}
                />
                <IconButton
                  label={`Remove ${p.alt}`}
                  icon={<Trash01 aria-hidden="true" />}
                  onClick={() => {
                    setRemoving(p);
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={removing !== null}
        title="Remove this photo?"
        onClose={() => {
          setRemoving(null);
        }}
      >
        <div className="exq-panelbody">
          <p>It comes off the gallery and the site right away.</p>
          <div className="exq-panelbody__row">
            <Button
              variant="accent"
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
          </div>
        </div>
      </Modal>
    </div>
  );
}

function GalleryFields({
  photo,
  chairs,
  onSave,
}: {
  photo: AdminPhotoView;
  chairs: { id: string; name: string }[];
  onSave: (body: { alt?: string; staffId?: string | null }) => void;
}) {
  const [alt, setAlt] = useState(photo.alt);
  return (
    <div className="exq-draft__fields">
      <form
        className="exq-gphoto__alt"
        onSubmit={(e) => {
          e.preventDefault();
          if (alt.trim() && alt.trim() !== photo.alt) onSave({ alt: alt.trim() });
        }}
      >
        <Input
          label="Alt text"
          required
          maxLength={200}
          value={alt}
          onChange={(e) => {
            setAlt(e.target.value);
          }}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={alt.trim() === photo.alt || alt.trim() === ''}
        >
          Save
        </Button>
      </form>
      <Select
        label="Credit the work to"
        value={photo.staffId ?? ''}
        onChange={(e) => {
          onSave({ staffId: e.target.value === '' ? null : e.target.value });
        }}
      >
        <option value="">Nobody in particular</option>
        {chairs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
