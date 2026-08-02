/**
 * Affiliate program routes.
 *
 * POST /api/affiliates/join          — register as an affiliate
 * POST /api/affiliates/send-code     — request an OTP login email
 * POST /api/affiliates/verify-code   — exchange OTP for a session JWT
 * GET  /api/affiliates/me            — dashboard data (auth required)
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq, and, sql } from 'drizzle-orm';
import { db, affiliates, affiliateConversions, affiliateEarnings } from '@workspace/db';

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AffiliateJwtPayload {
  role: 'affiliate';
  affiliateId: number;
  email: string;
  exp: number;
}

// Augment Request so middleware can attach the decoded affiliate
interface AuthedRequest extends Request {
  affiliateId: number;
  affiliateEmail: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateAffiliateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'AFF';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const apiKey = process.env.SMTP2GO_API_KEY;
  const sender =
    process.env.SMTP2GO_SENDER_EMAIL ?? 'noreply@businessweboptimizer.com';
  if (!apiKey) throw new Error('SMTP2GO_API_KEY not configured');

  const res = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      to: [email],
      sender,
      subject: 'Your Business Web Optimizer affiliate login code',
      text_body: `Your one-time affiliate login code is: ${otp}\n\nThis code expires in 15 minutes. Do not share it with anyone.`,
      html_body: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1A3A7A;margin-bottom:8px">Affiliate Login Code</h2>
          <p style="color:#374151">Use the code below to log in to your affiliate dashboard.</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:20px 24px;margin:20px 0;text-align:center">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;font-family:monospace;color:#1A3A7A">${otp}</span>
          </div>
          <p style="color:#6b7280;font-size:14px">This code expires in 15 minutes. If you did not request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
          <p style="color:#9ca3af;font-size:12px">Business Web Optimizer Affiliate Program</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SMTP2Go error (${res.status}): ${body}`);
  }
}

function issueAffiliateToken(affiliateId: number, email: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  return jwt.sign({ role: 'affiliate', affiliateId, email }, secret, {
    expiresIn: '7d',
  });
}

function requireAffiliateAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Server misconfigured.' });
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const payload = jwt.verify(
      authHeader.slice(7),
      secret,
    ) as AffiliateJwtPayload;
    if (payload.role !== 'affiliate') throw new Error('Wrong token role');
    (req as AuthedRequest).affiliateId = payload.affiliateId;
    (req as AuthedRequest).affiliateEmail = payload.email;
    next();
  } catch {
    res
      .status(401)
      .json({ error: 'Invalid or expired session. Request a new login code.' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/affiliates/join
// ---------------------------------------------------------------------------

router.post('/affiliates/join', async (req, res): Promise<void> => {
  const { name, email, website, promotionMethod, paypalEmail } = req.body as {
    name?: string;
    email?: string;
    website?: string;
    promotionMethod?: string;
    paypalEmail?: string;
  };

  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ error: 'Name and email are required.' });
    return;
  }

  const emailLower = email.trim().toLowerCase();

  // Duplicate email check
  const existing = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(eq(affiliates.email, emailLower))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({
      error:
        'An affiliate account with this email already exists. Log in to your dashboard instead.',
    });
    return;
  }

  // Generate a collision-free code
  let code = generateAffiliateCode();
  for (let attempt = 0; attempt < 9; attempt++) {
    const taken = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.code, code))
      .limit(1);
    if (taken.length === 0) break;
    code = generateAffiliateCode();
  }

  const [affiliate] = await db
    .insert(affiliates)
    .values({
      name: name.trim(),
      email: emailLower,
      code,
      website: website?.trim() || null,
      promotionMethod: promotionMethod?.trim() || null,
      paypalEmail: paypalEmail?.trim() || null,
      active: true,
    })
    .returning();

  req.log.info(
    { affiliateId: affiliate.id, code: affiliate.code },
    'New affiliate registered',
  );

  res.json({
    success: true,
    code: affiliate.code,
    name: affiliate.name,
    links: buildLinks(affiliate.code),
  });
});

// ---------------------------------------------------------------------------
// POST /api/affiliates/send-code
// ---------------------------------------------------------------------------

router.post('/affiliates/send-code', async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const emailLower = email.trim().toLowerCase();
  const [affiliate] = await db
    .select()
    .from(affiliates)
    .where(and(eq(affiliates.email, emailLower), eq(affiliates.active, true)))
    .limit(1);

  // Return 200 regardless to avoid email enumeration
  if (!affiliate) {
    res.json({ success: true });
    return;
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db
    .update(affiliates)
    .set({ otpCode: otp, otpExpiresAt: expiresAt })
    .where(eq(affiliates.id, affiliate.id));

  try {
    await sendOtpEmail(emailLower, otp);
  } catch (err) {
    req.log.error({ err }, 'Failed to send affiliate OTP email');
    res
      .status(500)
      .json({ error: 'Failed to send login code. Please try again.' });
    return;
  }

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/affiliates/verify-code
// ---------------------------------------------------------------------------

router.post('/affiliates/verify-code', async (req, res): Promise<void> => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email?.trim() || !code?.trim()) {
    res.status(400).json({ error: 'Email and code are required.' });
    return;
  }

  const emailLower = email.trim().toLowerCase();
  const [affiliate] = await db
    .select()
    .from(affiliates)
    .where(and(eq(affiliates.email, emailLower), eq(affiliates.active, true)))
    .limit(1);

  const invalid =
    !affiliate ||
    !affiliate.otpCode ||
    !affiliate.otpExpiresAt ||
    affiliate.otpCode !== code.trim() ||
    new Date() > affiliate.otpExpiresAt;

  if (invalid) {
    res.status(401).json({ error: 'Invalid or expired code.' });
    return;
  }

  // Clear OTP immediately to make it single-use
  await db
    .update(affiliates)
    .set({ otpCode: null, otpExpiresAt: null })
    .where(eq(affiliates.id, affiliate.id));

  const token = issueAffiliateToken(affiliate.id, affiliate.email);
  res.json({ token });
});

// ---------------------------------------------------------------------------
// GET /api/affiliates/me  (auth required)
// ---------------------------------------------------------------------------

router.get(
  '/affiliates/me',
  requireAffiliateAuth,
  async (req, res): Promise<void> => {
    const affiliateId = (req as AuthedRequest).affiliateId;

    const [affiliate] = await db
      .select()
      .from(affiliates)
      .where(eq(affiliates.id, affiliateId))
      .limit(1);

    if (!affiliate) {
      res.status(404).json({ error: 'Affiliate not found.' });
      return;
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [conversionsRow] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(affiliateConversions)
      .where(
        and(
          eq(affiliateConversions.affiliateId, affiliateId),
          eq(affiliateConversions.status, 'active'),
        ),
      );

    const [earningsRow] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${affiliateEarnings.commissionCents}), 0)::int`,
        paid: sql<number>`COALESCE(SUM(CASE WHEN ${affiliateEarnings.paid} THEN ${affiliateEarnings.commissionCents} ELSE 0 END), 0)::int`,
        unpaid: sql<number>`COALESCE(SUM(CASE WHEN NOT ${affiliateEarnings.paid} THEN ${affiliateEarnings.commissionCents} ELSE 0 END), 0)::int`,
      })
      .from(affiliateEarnings)
      .where(eq(affiliateEarnings.affiliateId, affiliateId));

    const [monthRow] = await db
      .select({
        amount: sql<number>`COALESCE(SUM(${affiliateEarnings.commissionCents}), 0)::int`,
      })
      .from(affiliateEarnings)
      .where(
        and(
          eq(affiliateEarnings.affiliateId, affiliateId),
          eq(affiliateEarnings.periodMonth, currentMonth),
          eq(affiliateEarnings.periodYear, currentYear),
        ),
      );

    res.json({
      affiliate: {
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        code: affiliate.code,
        website: affiliate.website,
        paypalEmail: affiliate.paypalEmail,
        createdAt: affiliate.createdAt,
      },
      links: buildLinks(affiliate.code),
      stats: {
        activeConversions: conversionsRow?.count ?? 0,
        totalEarningsCents: earningsRow?.total ?? 0,
        currentMonthCents: monthRow?.amount ?? 0,
        paidCents: earningsRow?.paid ?? 0,
        unpaidCents: earningsRow?.unpaid ?? 0,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLinks(code: string) {
  const base = 'https://businessweboptimizer.com/checkout';
  return {
    optimizer: `${base}?product=optimizer&ref=${code}`,
    optimizerPro: `${base}?product=optimizer-pro&ref=${code}`,
  };
}

export default router;
