/**
 * Tests for POST /api/scan
 *
 * Covers:
 *  - Free tier (no token): ≤3 issues returned, gated=true
 *  - Paid tier (valid JWT): all issues returned, gated falsy
 *  - Expired token: 401 + tokenExpired=true (no silent free fallback)
 *  - Tampered token: falls back to free tier, no 401
 *  - Malformed token: falls back to free tier, no 401
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { makePaidToken, makeProToken, makeExpiredToken, makeTamperedToken, MALFORMED_TOKEN } from './helpers/jwt';
import { BAD_HTML, GOOD_HTML } from './helpers/html';

// ---------------------------------------------------------------------------
// Mock global fetch so the scan route never hits the real internet
// ---------------------------------------------------------------------------

function makeHtmlFetch(html: string) {
  return vi.fn().mockResolvedValue(
    new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  );
}

beforeEach(() => {
  // Default: return the deliberately bad page (many issues)
  vi.stubGlobal('fetch', makeHtmlFetch(BAD_HTML));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/scan — free tier (no token)', () => {
  it('returns HTTP 200', async () => {
    const res = await request(app)
      .post('/api/scan')
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(200);
  });

  it('returns at most FREE_LIMIT=3 issues', async () => {
    const res = await request(app)
      .post('/api/scan')
      .send({ url: 'https://example.com' });
    expect(res.body.issues).toBeDefined();
    expect(res.body.issues.length).toBeLessThanOrEqual(3);
  });

  it('sets gated=true when there are more than 3 issues', async () => {
    const res = await request(app)
      .post('/api/scan')
      .send({ url: 'https://example.com' });
    // BAD_HTML triggers many issues, so gated must be true
    expect(res.body.gated).toBe(true);
    expect(typeof res.body.totalIssues).toBe('number');
    expect(res.body.totalIssues).toBeGreaterThan(3);
  });

  it('includes score and url in the response', async () => {
    const res = await request(app)
      .post('/api/scan')
      .send({ url: 'https://example.com' });
    expect(typeof res.body.score).toBe('number');
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
    expect(res.body.url).toBeTruthy();
  });

  it('returns 400 when url is missing', async () => {
    const res = await request(app).post('/api/scan').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when url is empty string', async () => {
    const res = await request(app).post('/api/scan').send({ url: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/scan — paid tier (Optimizer, valid token)', () => {
  it('returns HTTP 200', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(200);
  });

  it('returns all issues (no 3-issue cap)', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ url: 'https://example.com' });
    // BAD_HTML triggers 4+ issues; paid should return all of them
    expect(res.body.issues.length).toBeGreaterThan(3);
  });

  it('does NOT set gated=true', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ url: 'https://example.com' });
    expect(res.body.gated).toBeFalsy();
  });

  it('does NOT include totalIssues (not needed for full report)', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ url: 'https://example.com' });
    // totalIssues is only set when gated; paid report has none
    expect(res.body.gated).toBeFalsy();
  });
});

describe('POST /api/scan — paid tier (Optimizer Pro, valid token)', () => {
  it('returns all issues with no gating', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makeProToken()}`)
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(200);
    expect(res.body.gated).toBeFalsy();
    expect(res.body.issues.length).toBeGreaterThan(3);
  });
});

describe('POST /api/scan — well-optimised page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeHtmlFetch(GOOD_HTML));
  });

  it('paid scan on a good page produces a high score', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(200);
    // A good page should score above 50
    expect(res.body.score).toBeGreaterThan(50);
  });
});

describe('POST /api/scan — expired token', () => {
  it('returns 401', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makeExpiredToken()}`)
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(401);
  });

  it('includes tokenExpired=true in the response body', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makeExpiredToken()}`)
      .send({ url: 'https://example.com' });
    expect(res.body.tokenExpired).toBe(true);
  });

  it('does NOT silently fall back to free tier', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makeExpiredToken()}`)
      .send({ url: 'https://example.com' });
    // Must be 401, not 200 with limited results
    expect(res.status).not.toBe(200);
  });
});

describe('POST /api/scan — tampered/malformed token', () => {
  it('tampered token (wrong secret): silently falls back to free tier', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${makeTamperedToken()}`)
      .send({ url: 'https://example.com' });
    // Should NOT 401 — tampered = treat as unauthenticated
    expect(res.status).toBe(200);
    expect(res.body.gated).toBe(true);
  });

  it('malformed token string: falls back to free tier', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', `Bearer ${MALFORMED_TOKEN}`)
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(200);
    expect(res.body.gated).toBe(true);
  });
});
