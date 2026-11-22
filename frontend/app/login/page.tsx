'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, setTokens } from '@/lib/api';
import { loginSchema, registerSchema } from '@/lib/schemas';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setFormError('');
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = (mode === 'login' ? loginSchema : registerSchema).safeParse(data);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]))); return; }
    setErrors({}); setBusy(true);
    try {
      const t = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(parsed.data) });
      setTokens(t.access_token, t.refresh_token); router.replace('/projects');
    } catch (err) { setFormError(err instanceof ApiError ? err.message : 'Unexpected error'); } finally { setBusy(false); }
  }
  const field = (name: string, label: string, type = 'text') => (
    <label className="block text-sm">{label}
      <input name={name} type={type} aria-invalid={!!errors[name]} aria-describedby={`${name}-e`} className="mt-1 w-full rounded border px-3 py-2" />
      <span id={`${name}-e`} role="alert" className="text-red-600 text-xs">{errors[name]}</span>
    </label>);
  return (
    <main className="mx-auto mt-16 max-w-sm rounded-lg bg-white p-6 shadow">
      <h1 className="mb-4 text-2xl font-semibold">WorkSphere</h1>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {mode === 'register' && <>{field('org_name', 'Organization')}{field('name', 'Your name')}</>}
        {field('email', 'Email', 'email')}{field('password', 'Password', 'password')}
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <button disabled={busy} className="w-full rounded bg-indigo-600 py-2 text-white disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create organization'}</button>
      </form>
      <button className="mt-3 text-sm text-indigo-700 underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErrors({}); }}>
        {mode === 'login' ? 'Create an organization' : 'Have an account? Sign in'}</button>
    </main>);
}
