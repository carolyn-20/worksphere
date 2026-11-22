'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
export default function Team() {
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<any[]>('/users') });
  const [email, setEmail] = useState(''); const [role, setRole] = useState('member');
  const invite = useMutation({ mutationFn: () => api('/invitations', { method: 'POST', body: JSON.stringify({ email, role }) }) });
  return (<section><h1 className="mb-4 text-2xl font-semibold">Team</h1>
    <ul className="mb-6 space-y-1">{users.data?.map(u => <li key={u.id}>{u.name} — {u.email} ({u.role})</li>)}</ul>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); invite.mutate(); }}>
      <input aria-label="Invite email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="rounded border px-3 py-2" />
      <select aria-label="Role" value={role} onChange={e => setRole(e.target.value)} className="rounded border"><option>member</option><option>project_manager</option><option>auditor</option></select>
      <button className="rounded bg-indigo-600 px-4 text-white">Invite</button></form>
    {invite.data && <p className="mt-2 text-sm">Invite token (email is mocked): <code>{(invite.data as any).invite_token}</code></p>}
    {invite.error && <p role="alert" className="text-red-600">{(invite.error as ApiError).message}</p>}</section>);
}
