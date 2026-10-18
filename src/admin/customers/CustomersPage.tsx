import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import SearchLg from '@untitled-ui/icons-react/build/esm/SearchLg';
import {
  CUSTOMER_PAGE_SIZE,
  customerListResponseSchema,
  customerSortKeySchema,
  type CustomerListResponse,
} from '@shared/api/admin';
import { Button, DataTable, EmptyState, Input, type Column } from '@/components/ui';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { shopDateLabel } from '../format';
import { useQuick } from '../shell/quick';
import { CustomerSheet } from './CustomerSheet';

type Row = CustomerListResponse['rows'][number];

/**
 * Everyone who has booked, one row per phone number (there are no accounts). Search by name, phone
 * or the last four digits; a row opens the customer panel with the visit history and a private note.
 */
export function CustomersPage() {
  usePageTitle('Customers');
  const quick = useQuick();
  const navigate = useNavigate();
  const phone = useParams().phone ?? null;
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = customerSortKeySchema.catch('last').parse(params.get('sort') ?? 'last');
  const dir = params.get('dir') === 'asc' ? 'asc' : params.get('dir') === 'desc' ? 'desc' : null;
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const [typed, setTyped] = useState(q);

  // Typing waits a moment before it goes into the address and out to the server.
  useEffect(() => {
    if (typed === q) return;
    const id = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (typed.trim()) next.set('q', typed.trim());
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    }, 250);
    return () => {
      window.clearTimeout(id);
    };
  }, [typed, q, params, setParams]);

  const query = new URLSearchParams({ sort, page: String(page) });
  if (q) query.set('q', q);
  if (dir) query.set('dir', dir);
  const list = useApi(`/api/admin/customer-list?${query.toString()}`, customerListResponseSchema, {
    version: quick.version,
  });
  const effectiveDir = dir ?? (sort === 'name' ? 'asc' : 'desc');

  function onSort(key: string) {
    const k = customerSortKeySchema.parse(key);
    const next = new URLSearchParams(params);
    next.set('sort', k);
    next.set(
      'dir',
      k === sort ? (effectiveDir === 'asc' ? 'desc' : 'asc') : k === 'name' ? 'asc' : 'desc',
    );
    next.delete('page');
    setParams(next);
  }
  function setPage(n: number) {
    const next = new URLSearchParams(params);
    if (n <= 1) next.delete('page');
    else next.set('page', String(n));
    setParams(next);
  }

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', sortable: true, primary: true, render: (r) => r.name },
    { key: 'phone', header: 'Phone', render: (r) => r.phone },
    { key: 'visits', header: 'Visits', sortable: true, align: 'end', render: (r) => r.visits },
    {
      key: 'last',
      header: 'Last visit',
      sortable: true,
      wide: true,
      render: (r) => (r.lastVisitAt ? shopDateLabel(r.lastVisitAt.slice(0, 10)) : 'None yet'),
    },
    {
      key: 'noShows',
      header: 'No-shows',
      sortable: true,
      align: 'end',
      wide: true,
      render: (r) => r.noShows,
    },
    { key: 'barber', header: 'Usual barber', wide: true, render: (r) => r.usualBarber ?? 'None' },
  ];
  const data = list.status === 'ready' ? list.data : null;
  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * CUSTOMER_PAGE_SIZE + 1;
  const last = Math.min(total, page * CUSTOMER_PAGE_SIZE);

  return (
    <div className="exq-customers" data-state={list.status}>
      <div className="exq-dash-head">
        <h1>Customers</h1>
      </div>
      <div className="exq-filters">
        <div className="exq-customers__search">
          <Input
            label="Search customers"
            type="search"
            placeholder="Name, phone or last four digits"
            autoComplete="off"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
            }}
          />
          <SearchLg className="exq-customers__icon" aria-hidden="true" />
        </div>
      </div>
      <section className="exq-panel" data-flush="true" aria-label="Customer list">
        <DataTable
          caption="Customers"
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.phoneE164}
          state={list.status}
          sort={{ key: sort, dir: effectiveDir }}
          onSort={onSort}
          onOpen={(r) => {
            void navigate(
              `/admin/customers/${r.phoneE164.replace(/\D/g, '')}${window.location.search}`,
            );
          }}
          openLabel={(r) => `Open ${r.name}, ${r.phone}`}
          onRetry={quick.changed}
          empty={
            <EmptyState
              title={q ? 'No one matches' : 'No customers yet'}
              action={
                q ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTyped('');
                    }}
                  >
                    Clear search
                  </Button>
                ) : undefined
              }
            >
              {q
                ? 'Try the start of a name or the last four digits of the phone.'
                : 'Customers appear here after their first booking.'}
            </EmptyState>
          }
          footer={
            data && total > 0 ? (
              <>
                <span aria-live="polite">
                  {first} to {last} of {total}
                </span>
                <span className="exq-pager">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => {
                      setPage(page - 1);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={last >= total}
                    onClick={() => {
                      setPage(page + 1);
                    }}
                  >
                    Next
                  </Button>
                </span>
              </>
            ) : null
          }
        />
      </section>
      <CustomerSheet
        phone={phone}
        onClose={() => {
          void navigate(`/admin/customers${window.location.search}`);
        }}
      />
    </div>
  );
}
