'use client';

import { Download, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, buttonClass, Card, ErrorText, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, apiUpload, downloadCsv, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ImportPreview } from '@/lib/types';

const MAX_BYTES = 1024 * 1024;
const MAX_ROWS = 500;
const COLUMNS = ['email', 'display_name', 'role', 'employee_id', 'first_name', 'last_name', 'job_title', 'department', 'phone'];

export default function ImportUsersPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isAdmin = me?.role === 'ADMIN';
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (me && !isAdmin) router.replace('/');
  }, [me, isAdmin, router]);

  if (!isAdmin) return null;

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError('');
    setPreview(null);
    setDone(false);
    if (f && f.size > MAX_BYTES) {
      setError('The file is larger than 1 MB.');
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function runPreview() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      setPreview(await apiUpload<ImportPreview>('/admin/users/import/preview', form));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    if (!window.confirm('Create these accounts now? The temporary passwords are shown only once, in the file that will download. If the download fails, the accounts still exist: reset their passwords from the Users page.')) return;
    setBusy(true);
    setError('');
    try {
      // The CSV of temporary passwords is downloaded straight to the browser and not kept in the page.
      await downloadCsv('/admin/users/import/commit', { json: { importId: preview.importId } });
      setDone(true);
      setPreview(null);
      setFile(null);
      toast(`Imported ${preview.validCount} users. Store the password file securely, then delete it after distributing.`, 'success');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Import users from CSV"
        subtitle="All-or-nothing: if any row is wrong, nothing is created."
        actions={
          <Link href="/admin/users" className={buttonClass('secondary')}>
            Back to users
          </Link>
        }
      />

      <div className="grid gap-6">
        <Card className="p-5">
          <h2 className="mb-2 font-semibold">1. Prepare the file</h2>
          <ul className="mb-4 list-inside list-disc space-y-1 text-[13px] text-fg-muted">
            <li>UTF-8 (Excel “CSV UTF-8” is fine). At most {MAX_ROWS} rows, 1 MB.</li>
            <li>Header, in this order: {COLUMNS.join(', ')}</li>
            <li>Role is ADMIN, HOST or MEMBER. Department must match an active department name.</li>
            <li>The file has no password column. Each new user gets a random temporary password and must change it at first sign-in.</li>
            <li>Only you can import a file you previewed. If the password file does not download, the accounts are already created: reset their passwords from the Users page.</li>
          </ul>
          <a href="/api/admin/users/import/template.csv" download className={buttonClass('secondary')}>
            <Download className="size-4" /> Download template
          </a>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 font-semibold">2. Upload and preview</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".csv,text/csv" onChange={pick} aria-label="CSV file" className="text-[13px]" />
            <Button onClick={runPreview} disabled={!file} loading={busy && !preview}>
              <Upload className="size-4" /> Preview
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>

          {busy && !preview && <div className="mt-4"><Spinner /></div>}

          {preview && (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
                <Pill tone="success">{preview.validCount} valid</Pill>
                {preview.errorCount > 0 && <Pill tone="danger">{preview.errorCount} with errors</Pill>}
                <span className="text-fg-subtle">{preview.total} rows</span>
              </div>
              <div className="overflow-x-auto rounded border border-line/60">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b border-line/60 text-xs tracking-[0.015em] text-fg-subtle uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Line</th>
                      {COLUMNS.map((c) => (
                        <th key={c} className="px-3 py-2 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {preview.rows.map((row) => (
                      <tr key={row.line} className={row.errors.length ? 'bg-danger/10' : ''}>
                        <td className="px-3 py-2 font-mono">{row.line}</td>
                        {COLUMNS.map((c) => {
                          const err = row.errors.find((e) => e.column === c);
                          return (
                            <td key={c} className={`px-3 py-2 ${err ? 'text-danger' : ''}`} title={err?.message}>
                              {row.values[c] || <span className="text-fg-subtle">—</span>}
                              {err && <span className="block text-xs">{err.message}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.errorCount > 0 && <p className="mt-3 text-[13px] text-danger">Fix the highlighted rows and upload the file again. Import stays disabled until every row is valid.</p>}
              <div className="mt-4 flex justify-end">
                <Button onClick={commit} disabled={preview.errorCount > 0 || preview.total === 0} loading={busy}>
                  Import {preview.validCount} users
                </Button>
              </div>
            </div>
          )}

          {done && (
            <p className="mt-4 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">
              Temporary passwords are shown only once. Store the file securely and delete it after distributing.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
