import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { searchResponseSchema, type SearchResponse } from '@shared/api/admin';
import { SearchBox, type SearchGroup } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { shopDateTime } from '../format';
import { useQuick } from './quick';

const EMPTY: SearchResponse = { bookings: [], customers: [] };

/** The top bar search: bookings and customers in one grouped list, "/" focuses it on desktop. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const quick = useQuick();
  const [results, setResults] = useState<SearchResponse>(EMPTY);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const latest = useRef(0);

  const onQuery = useCallback((q: string) => {
    latest.current += 1;
    const mine = latest.current;
    if (q === '') {
      setResults(EMPTY);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    apiRequest(`/api/admin/search?q=${encodeURIComponent(q)}`, searchResponseSchema)
      .then((data) => {
        if (mine !== latest.current) return;
        setResults(data);
        setStatus('idle');
      })
      .catch(() => {
        if (mine !== latest.current) return;
        setStatus('error');
      });
  }, []);

  const groups = useMemo<SearchGroup[]>(
    () =>
      [
        {
          label: 'Bookings',
          items: results.bookings.map((b) => ({
            key: b.id,
            text: `${b.customerName}, ${b.referenceCode}`,
            title: `${b.customerName}  ${b.referenceCode}`,
            detail: `${shopDateTime(b.startAt)} with ${b.staffName}, ${b.services}`,
          })),
        },
        {
          label: 'Customers',
          items: results.customers.map((c) => ({
            key: c.phone,
            text: `${c.name}, ${c.phone}`,
            title: c.name,
            detail: `${c.phone}, ${c.visits} ${c.visits === 1 ? 'visit' : 'visits'}`,
          })),
        },
      ].filter((g) => g.items.length > 0),
    [results],
  );

  return (
    <SearchBox
      label="Search bookings and customers"
      placeholder="Search name, phone or code"
      groups={groups}
      status={status}
      shortcut
      onQuery={onQuery}
      onChoose={(group, key) => {
        if (group === 'Bookings') quick.openBooking(key);
        else void navigate(`/admin/shop/clients/${key.replace(/\D/g, '')}`);
      }}
    />
  );
}
