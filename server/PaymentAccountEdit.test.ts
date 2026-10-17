import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from './DatabaseService.js';

// Super Admin edits to payment accounts: the form sends assigned_agent_id: '' for "no agent".
describe('Payment account edits', () => {
  let db: DatabaseService;
  const adminId = 'usr_pay_admin';
  const agentId = 'usr_pay_agent';

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    db.createUser({ id: adminId, telegram_id: 'tg_pay_admin', username: 'PayAdmin', role: 'SUPER_ADMIN', referral_code: 'REF_PADM' });
    db.createUser({ id: agentId, telegram_id: 'tg_pay_agent', username: 'PayAgent', role: 'AGENT', referral_code: 'REF_PAGT' });
  });

  const form = (overrides: Record<string, any> = {}) => ({
    provider: 'Telebirr', account_name: 'Main Telebirr', phone_number: '0911223344', assigned_agent_id: '', instructions: '', ...overrides
  });

  it('saves an edit with no assigned agent', () => {
    const acc = db.createPaymentAccount(form() as any);
    const updated = db.updatePaymentAccount(acc.id, form({ phone_number: '0911556677' }) as any, adminId, 'new number');
    expect(updated.phone_number).toBe('0911556677');
    expect(updated.assigned_agent_id).toBeNull();
  });

  it('can assign and then unassign an agent', () => {
    const acc = db.createPaymentAccount(form() as any);
    expect(db.updatePaymentAccount(acc.id, form({ assigned_agent_id: agentId }) as any, adminId).assigned_agent_id).toBe(agentId);
    expect(db.updatePaymentAccount(acc.id, form({ assigned_agent_id: '' }) as any, adminId).assigned_agent_id).toBeNull();
  });

  it('rejects an assigned agent that does not exist or is not an agent, with a clear message', () => {
    const acc = db.createPaymentAccount(form() as any);
    expect(() => db.updatePaymentAccount(acc.id, form({ assigned_agent_id: 'usr_missing' }) as any, adminId)).toThrow(/agent/i);
    expect(() => db.updatePaymentAccount(acc.id, form({ assigned_agent_id: adminId }) as any, adminId)).toThrow(/agent/i);
    expect(() => db.createPaymentAccount(form({ assigned_agent_id: 'usr_missing' }) as any)).toThrow(/agent/i);
  });
});
