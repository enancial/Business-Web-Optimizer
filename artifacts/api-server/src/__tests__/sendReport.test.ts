/**
 * Tests for POST /api/send-report
 *
 * Covers:
 *  - The lead is stored before any email is sent
 *  - Report and owner notice both go out through /email/batch
 *  - The lead row records the report email_id and the owner notice
 *  - SMTP2Go failure still notifies the owner and returns 502
 *  - A storage failure does not stop the report, and the owner notice says so
 *  - Missing SMTP2GO_API_KEY fails loudly with 500 after storing the lead
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

const { mockInsert, mockUpdate, calls } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  calls: [] as string[],
}));

vi.mock('@workspace/db', () => ({
  db: { insert: mockInsert, update: mockUpdate, select: vi.fn() },
  reportLeads: { id: 'id' },
  affiliates: {},
  affiliateConversions: {},
  affiliateEarnings: {},
}));

import app from '../app';

function chain<T>(resolveWith: T | Error, onAwait?: () => void) {
  const c: Record<string, unknown> = {};
  for (const n of ['values', 'returning', 'set', 'where']) c[n] = vi.fn().mockReturnValue(c);
  c.then = (res: (v: T) => unknown, rej: (e: unknown) => unknown) => {
    onAwait?.();
    return resolveWith instanceof Error ? Promise.reject(resolveWith).then(res, rej) : Promise.resolve(resolveWith).then(res, rej);
  };
  return c;
}

const BODY = {
  email: 'visitor@example.com',
  url: 'https://example.com',
  score: 72,
  issues: [{ severity: 'high', title: 'Missing title', detail: 'No <title>' }],
};

let fetchSpy: ReturnType<typeof vi.fn>;
let updates: Array<Record<string, unknown>>;

function okBatch(id: string) {
  return { ok: true, status: 200, json: async () => ({ data: [{ email_id: id }] }) } as unknown as Response;
}

function sentTo(i: number): { to: string[]; subject: string; text_body?: string } {
  const payload = JSON.parse(fetchSpy.mock.calls[i][1].body as string) as { emails: Array<{ to: string[]; subject: string; text_body?: string }> };
  return payload.emails[0];
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  updates = [];
  process.env.SMTP2GO_API_KEY = 'test-smtp-key';
  process.env.LEAD_NOTIFY_EMAIL = 'owner@example.com';

  mockInsert.mockImplementation(() => chain([{ id: 41 }], () => calls.push('insert')));
  mockUpdate.mockImplementation(() => {
    const c = chain(undefined);
    (c.set as ReturnType<typeof vi.fn>).mockImplementation((patch: Record<string, unknown>) => {
      updates.push(patch);
      return c;
    });
    return c;
  });
  fetchSpy = vi.fn().mockImplementation(async () => {
    calls.push('fetch');
    return okBatch(`email-${calls.length}`);
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/send-report', () => {
  it('stores the lead before sending, then sends the report and the owner notice', async () => {
    const res = await request(app).post('/api/send-report').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, stored: true, leadId: 41, ownerNotified: true });
    expect(calls[0]).toBe('insert');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.smtp2go.com/v3/email/batch');
    expect(sentTo(0).to).toEqual(['visitor@example.com']);
    expect(sentTo(1).to).toEqual(['owner@example.com']);
    expect(sentTo(1).text_body).toContain('visitor@example.com');
    expect(sentTo(1).text_body).toContain('yes, id 41');
    expect(updates).toContainEqual(expect.objectContaining({ reportStatus: 'sent' }));
    expect(updates).toContainEqual({ ownerNotified: true });
  });

  it('still notifies the owner and returns 502 when the report send fails', async () => {
    fetchSpy.mockReset();
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ data: { error: 'bad recipient' } }) } as unknown as Response)
      .mockResolvedValueOnce(okBatch('owner-1'));

    const res = await request(app).post('/api/send-report').send(BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('bad recipient');
    expect(updates).toContainEqual(expect.objectContaining({ reportStatus: 'failed', reportError: 'bad recipient' }));
    expect(sentTo(1).to).toEqual(['owner@example.com']);
    expect(sentTo(1).text_body).toContain('NO — bad recipient');
  });

  it('sends the report when storage fails and tells the owner the email is the only record', async () => {
    mockInsert.mockImplementation(() => chain(new Error('D1 down')));

    const res = await request(app).post('/api/send-report').send(BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: true, stored: false, leadId: null });
    expect(sentTo(1).text_body).toContain('storage failed');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('stores the lead and fails loudly with 500 when SMTP2GO_API_KEY is unset', async () => {
    delete process.env.SMTP2GO_API_KEY;

    const res = await request(app).post('/api/send-report').send(BODY);

    expect(res.status).toBe(500);
    expect(calls).toEqual(['insert']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ reportStatus: 'failed' }));
  });

  it('rejects an invalid email without storing anything', async () => {
    const res = await request(app).post('/api/send-report').send({ ...BODY, email: 'nope' });

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
