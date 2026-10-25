import { useState } from 'react';
import ArrowDown from '@untitled-ui/icons-react/build/esm/ArrowDown';
import ArrowUp from '@untitled-ui/icons-react/build/esm/ArrowUp';
import DotsGrid from '@untitled-ui/icons-react/build/esm/DotsGrid';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import {
  serviceListResponseSchema,
  serviceResponseSchema,
  type AdminServiceView,
} from '@shared/api/admin';
import { Button, EmptyState, ErrorState, IconButton, Sheet, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { money } from '../format';
import { useQuick } from '../shell/quick';
import { ServiceEditor } from './ServiceEditor';

/**
 * The service menu. Drag a row (or use the arrows) to reorder it; Hide takes a service off the
 * booking page without losing it; Edit changes name, description, price, time and which barbers
 * do it. The public site and booking use the new order right away.
 */
export function ServicesPanel() {
  const quick = useQuick();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const list = useApi('/api/admin/services', serviceListResponseSchema, {
    version: version + quick.version,
  });
  const [editing, setEditing] = useState<AdminServiceView | 'new' | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (list.status === 'error')
    return (
      <ErrorState title="The services did not load">
        Check the connection and reload the page.
      </ErrorState>
    );
  const all = list.status === 'ready' ? list.data.services.filter((s) => !s.deletedAt) : [];
  const shown = order
    ? order
        .map((id) => all.find((s) => s.id === id))
        .filter((s): s is AdminServiceView => s !== undefined)
    : all;

  async function persist(ids: string[]) {
    setBusy(true);
    try {
      // Each service gets its place in the list as its sort order, 10 apart.
      for (const [index, id] of ids.entries()) {
        const current = all.find((s) => s.id === id);
        if (current && current.sortOrder !== index * 10) {
          await apiRequest(`/api/admin/services/${id}`, serviceResponseSchema, {
            method: 'PATCH',
            body: { sortOrder: index * 10 },
          });
        }
      }
      setVersion((v) => v + 1);
      toast({ text: 'Order saved. The site uses it right away.', tone: 'ok' });
    } catch {
      toast({ text: 'The order did not save. Try again.', tone: 'danger' });
    } finally {
      setOrder(null);
      setBusy(false);
    }
  }

  function moveTo(id: string, targetIndex: number) {
    const ids = shown.map((s) => s.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, targetIndex)), 0, id);
    setOrder(ids);
    return ids;
  }

  async function toggleHidden(s: AdminServiceView) {
    try {
      await apiRequest(`/api/admin/services/${s.id}`, serviceResponseSchema, {
        method: 'PATCH',
        body: { isActive: !s.isActive },
      });
      setVersion((v) => v + 1);
      toast({
        text: s.isActive ? `${s.name} is hidden from booking.` : `${s.name} is back on the menu.`,
        tone: 'ok',
      });
    } catch {
      toast({ text: 'That did not save. Try again.', tone: 'danger' });
    }
  }

  return (
    <div className="exq-tabbody exq-tabbody--wide">
      <div>
        <Button
          size="sm"
          icon={<Plus aria-hidden="true" />}
          onClick={() => {
            setEditing('new');
          }}
        >
          Add service
        </Button>
      </div>
      {list.status === 'loading' ? (
        <p className="exq-skeleton exq-services__placeholder" aria-busy="true">
          Loading the services
        </p>
      ) : shown.length === 0 ? (
        <EmptyState title="No services yet">Add the first one to start taking bookings.</EmptyState>
      ) : (
        <ol
          className="exq-svclist exq-bare"
          aria-label="Services, in the order the site shows them"
          data-busy={busy ? 'true' : 'false'}
        >
          {shown.map((s, index) => (
            <li
              key={s.id}
              className="exq-svc"
              data-state={s.isActive ? 'active' : 'hidden'}
              data-dragging={dragging === s.id ? 'true' : 'false'}
              draggable
              onDragStart={() => {
                setDragging(s.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragging && dragging !== s.id) moveTo(dragging, index);
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
              <div className="exq-svc__body">
                <strong>{s.name}</strong>
                <span className="exq-svc__meta">
                  {s.group}, {s.durationMinutes} min, {s.priceFrom ? 'from ' : ''}
                  {money(s.priceCents)}
                </span>
              </div>
              {s.isActive ? null : (
                <span className="exq-status-chip" data-tone="muted">
                  Hidden
                </span>
              )}
              <div className="exq-svc__actions">
                <IconButton
                  label={`Move ${s.name} up`}
                  icon={<ArrowUp aria-hidden="true" />}
                  disabled={index === 0 || busy}
                  onClick={() => {
                    void persist(moveTo(s.id, index - 1));
                  }}
                />
                <IconButton
                  label={`Move ${s.name} down`}
                  icon={<ArrowDown aria-hidden="true" />}
                  disabled={index === shown.length - 1 || busy}
                  onClick={() => {
                    void persist(moveTo(s.id, index + 1));
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(s);
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleHidden(s)}>
                  {s.isActive ? 'Hide' : 'Show'}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Sheet
        open={editing !== null}
        title={editing === 'new' ? 'Add service' : 'Edit service'}
        size="lg"
        onClose={() => {
          setEditing(null);
        }}
      >
        <div className="exq-panelhost">
          {editing ? (
            <ServiceEditor
              key={editing === 'new' ? 'new' : editing.id}
              service={editing === 'new' ? null : editing}
              nextSortOrder={all.length * 10}
              onSaved={() => {
                setEditing(null);
                setVersion((v) => v + 1);
                quick.changed();
              }}
            />
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
