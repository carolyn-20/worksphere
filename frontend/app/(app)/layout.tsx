'use client';
// Protected, role-specific shell: nav is derived from the JWT role; the API still enforces every permission.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, hasSession, logoutLocal, roleFromToken } from '@/lib/api';
import { NAV, Role } from '@/lib/schemas';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter(), path = usePathname();
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => { if (!hasSession()) router.replace('/login'); else setRole(roleFromToken() as Role); }, [router]);
  if (!role) return <p className="p-6" role="status">Loading…</p>;
  const allowed = NAV[role].some(n => path.startsWith(n.href)) || path.startsWith('/projects');
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav aria-label="Main" className="bg-slate-900 p-4 text-white md:w-56">
        <p className="mb-1 text-lg font-semibold">WorkSphere</p><p className="mb-4 text-xs opacity-70">{role.replace('_', ' ')}</p>
        <ul className="flex gap-3 md:block md:space-y-2">{NAV[role].map(n => <li key={n.href}><Link href={n.href} aria-current={path.startsWith(n.href) ? 'page' : undefined} className="underline-offset-4 hover:underline focus:outline focus:outline-2">{n.label}</Link></li>)}</ul>
        <button className="mt-4 text-sm underline" onClick={async () => { try { await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: sessionStorage.getItem('refresh') }) }); } catch {} logoutLocal(); router.replace('/login'); }}>Sign out</button>
      </nav>
      <main className="flex-1 p-4 md:p-8">{allowed ? children : <p role="alert">You do not have access to this page.</p>}</main>
    </div>);
}
