'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, roleFromToken } from '@/lib/api';
import { canManage, Role } from '@/lib/schemas';

export default function Projects() {
  const qc = useQueryClient(); const [name, setName] = useState('');
  const role = roleFromToken() as Role;
  const q = useQuery({ queryKey: ['projects'], queryFn: () => api<any[]>('/projects?limit=50') });
  const create = useMutation({ mutationFn: () => api('/projects', { method: 'POST', body: JSON.stringify({ name }) }), onSuccess: () => { setName(''); qc.invalidateQueries({ queryKey: ['projects'] }); } });
  return (<section><h1 className="mb-4 text-2xl font-semibold">Projects</h1>
    {canManage(role) && <form className="mb-4 flex gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
      <input aria-label="Project name" value={name} onChange={e => setName(e.target.value)} className="rounded border px-3 py-2" placeholder="New project" />
      <button className="rounded bg-indigo-600 px-4 text-white">Create</button></form>}
    {create.error && <p role="alert" className="text-red-600">{(create.error as ApiError).message}</p>}
    {q.isLoading && <p role="status">Loading…</p>}
    {q.error && <p role="alert" className="text-red-600">{(q.error as ApiError).message}</p>}
    {q.data?.length === 0 && <p>No projects yet.</p>}
    <ul className="space-y-2">{q.data?.map(p => <li key={p.id}><Link className="text-indigo-700 underline" href={`/projects/${p.id}`}>{p.name}</Link></li>)}</ul></section>);
}
