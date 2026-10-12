'use client';

import { Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { Button, Card, EmptyState, Input, Label, PageHeader, Select, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { Department, DirectoryUser, Paged } from '@/lib/types';

export default function PeoplePage() {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [data, setData] = useState<Paged<DirectoryUser> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Department[]>('/departments').then(setDepartments).catch(() => undefined);
  }, []);

  // Search waits for a pause in typing, and any change to the search or the filter starts again at page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page) });
    if (term) qs.set('q', term);
    if (departmentId) qs.set('departmentId', departmentId);
    let cancelled = false;
    setError('');
    api<Paged<DirectoryUser>>(`/directory?${qs.toString()}`)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [term, departmentId, page]);

  const pages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1;

  return (
    <>
      <PageHeader title="People" subtitle="Everyone who can sign in. Contact details beyond email are shown only to administrators." />
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Label htmlFor="p-search">Search by name or email</Label>
          <Input id="p-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, last name or email" />
        </div>
        <div>
          <Label htmlFor="p-dept">Department</Label>
          <Select
            id="p-dept"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 text-danger">{error}</p>}
      {!data && !error && <Spinner />}
      {data && data.total === 0 && <EmptyState icon={<Mail className="size-8" />} title="No one matches">Try a different name or department.</EmptyState>}

      {data && data.total > 0 && (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((u) => (
              <li key={u.id}>
                <Card className="flex h-full gap-3 p-4">
                  <Avatar userId={u.id} name={u.displayName} avatarVersion={u.avatarVersion} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{u.displayName}</p>
                    {(u.firstName || u.lastName) && <p className="truncate text-[13px] text-fg-muted">{[u.firstName, u.lastName].filter(Boolean).join(' ')}</p>}
                    {u.jobTitle && <p className="truncate text-[13px] text-fg-subtle">{u.jobTitle}</p>}
                    {u.department && (
                      <p className="truncate text-[13px] text-fg-subtle">
                        {u.department.name}
                        {!u.department.isActive && ' (inactive)'}
                      </p>
                    )}
                    <a href={`mailto:${u.email}`} className="mt-1 block truncate text-[13px] text-cyan hover:underline">
                      {u.email}
                    </a>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between text-[13px] text-fg-subtle">
            <span>
              {data.total} people · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
