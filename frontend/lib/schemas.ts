import { z } from 'zod';
export const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password required') });
export const registerSchema = loginSchema.extend({ org_name: z.string().min(2, 'Min 2 characters'), name: z.string().min(1, 'Required'), password: z.string().min(10, 'Min 10 characters') });
export const taskSchema = z.object({ title: z.string().trim().min(1, 'Title required').max(200), description: z.string().max(5000).optional() });
export type Role = 'platform_admin' | 'owner' | 'project_manager' | 'member' | 'auditor';
export const NAV: Record<Role, { href: string; label: string }[]> = {
  platform_admin: [{ href: '/projects', label: 'Projects' }, { href: '/team', label: 'Team' }, { href: '/audit', label: 'Audit' }],
  owner: [{ href: '/projects', label: 'Projects' }, { href: '/team', label: 'Team' }, { href: '/audit', label: 'Audit' }],
  project_manager: [{ href: '/projects', label: 'Projects' }, { href: '/team', label: 'Team' }],
  member: [{ href: '/projects', label: 'My work' }],
  auditor: [{ href: '/projects', label: 'Projects (read-only)' }, { href: '/audit', label: 'Audit' }],
};
export const canWrite = (r: Role) => r !== 'auditor';
export const canManage = (r: Role) => ['owner', 'project_manager', 'platform_admin'].includes(r);
