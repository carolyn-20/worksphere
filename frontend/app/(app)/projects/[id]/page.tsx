'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, roleFromToken } from '@/lib/api';
import { canWrite, Role, taskSchema } from '@/lib/schemas';

const STATUSES = ['todo', 'in_progress', 'done'] as const;
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>(); const qc = useQueryClient();
  const role = roleFromToken() as Role; const [msg, setMsg] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState(''); const [formErr, setFormErr] = useState('');
  const tasks = useQuery({ queryKey: ['tasks', id], queryFn: () => api<any[]>(`/projects/${id}/tasks?limit=100`) });
  const health = useQuery({ queryKey: ['health', id], queryFn: () => api<any>(`/projects/${id}/health`), retry: false });
  const activity = useQuery({ queryKey: ['activity', open], enabled: !!open, queryFn: () => api<any[]>(`/tasks/${open}/activity`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['tasks', id] }); qc.invalidateQueries({ queryKey: ['health', id] }); qc.invalidateQueries({ queryKey: ['activity'] }); };
  const create = useMutation({ mutationFn: (t: string) => api(`/projects/${id}/tasks`, { method: 'POST', body: JSON.stringify({ title: t }) }), onSuccess: () => { setTitle(''); refresh(); } });
  // Optimistic concurrency: send the version we loaded; 409 => someone else changed it first.
  const move = useMutation({
    mutationFn: (v: { t: any; status: string }) => api(`/tasks/${v.t.id}`, { method: 'PATCH', body: JSON.stringify({ status: v.status, version: v.t.version }) }),
    onSuccess: () => { setMsg(''); refresh(); },
    onError: (e: ApiError) => { setMsg(e.status === 409 ? 'Someone else changed this task. Latest version loaded — review and retry.' : e.message); refresh(); },
  });
  return (<section><h1 className="mb-4 text-2xl font-semibold">Project board</h1>
    {health.data && <p className="mb-4 text-sm">Total {health.data.total} · Overdue {health.data.overdue} · Avg cycle {health.data.avg_cycle_days ?? '–'}d · Health <b>{health.data.health}</b></p>}
    {health.error && <p className="mb-2 text-sm text-slate-500">Analytics unavailable.</p>}
    {msg && <p role="alert" className="mb-2 rounded bg-amber-100 p-2 text-sm">{msg}</p>}
    {canWrite(role) && <form className="mb-4 flex gap-2" onSubmit={e => { e.preventDefault(); const r = taskSchema.safeParse({ title }); if (!r.success) return setFormErr(r.error.issues[0].message); setFormErr(''); create.mutate(r.data.title); }}>
      <input aria-label="Task title" value={title} onChange={e => setTitle(e.target.value)} className="rounded border px-3 py-2" placeholder="New task" />
      <button className="rounded bg-indigo-600 px-4 text-white">Add</button><span role="alert" className="text-sm text-red-600">{formErr}</span></form>}
    {tasks.isLoading && <p role="status">Loading…</p>}
    {tasks.error && <p role="alert" className="text-red-600">{(tasks.error as ApiError).message}</p>}
    <div className="grid gap-4 md:grid-cols-3">{STATUSES.map(s => (
      <div key={s} className="rounded bg-white p-3 shadow"><h2 className="mb-2 font-medium">{s.replace('_', ' ')}</h2>
        {tasks.data?.filter(t => t.status === s).map(t => (
          <div key={t.id} className="mb-2 rounded border p-2 text-sm"><button className="text-left underline" onClick={() => setOpen(t.id)}>{t.title}</button>
            {canWrite(role) && <select aria-label={`Status for ${t.title}`} value={t.status} onChange={e => move.mutate({ t, status: e.target.value })} className="mt-1 block rounded border">{STATUSES.map(x => <option key={x}>{x}</option>)}</select>}</div>))}
      </div>))}</div>
    {open && <aside className="mt-6 rounded bg-white p-4 shadow"><h2 className="font-medium">Activity timeline</h2>
      <ol className="mt-2 space-y-1 text-sm">{activity.data?.map(a => <li key={a.id}>v{a.version} · {a.action} · {new Date(a.created_at).toLocaleString()} · {JSON.stringify(a.changes)}</li>)}</ol></aside>}
  </section>);
}
