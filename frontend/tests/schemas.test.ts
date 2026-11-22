import { describe, expect, it } from 'vitest';
import { canManage, canWrite, registerSchema, taskSchema } from '../lib/schemas';
describe('schemas & permissions', () => {
  it('accepts a valid task', () => expect(taskSchema.safeParse({ title: 'Ship' }).success).toBe(true));
  it('rejects blank title', () => expect(taskSchema.safeParse({ title: '  ' }).success).toBe(false));
  it('rejects short password', () => expect(registerSchema.safeParse({ org_name: 'Acme', name: 'A', email: 'a@b.co', password: 'short' }).success).toBe(false));
  it('auditor is read-only', () => { expect(canWrite('auditor')).toBe(false); expect(canManage('member')).toBe(false); });
});
