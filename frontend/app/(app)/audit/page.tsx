'use client';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
export default function Audit() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<any[]>('/audit?limit=100') });
  return (<section><h1 className="mb-4 text-2xl font-semibold">Audit log</h1>
    {q.error && <p role="alert" className="text-red-600">{(q.error as ApiError).message}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>When</th><th>Action</th><th>Entity</th></tr></thead>
      <tbody>{q.data?.map(a => <tr key={a.id}><td>{new Date(a.created_at).toLocaleString()}</td><td>{a.action}</td><td>{a.entity}</td></tr>)}</tbody></table></div></section>);
}
