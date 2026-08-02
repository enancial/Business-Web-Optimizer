/**
 * Admin-only affiliate management routes.
 *
 * All routes require: Authorization: Bearer <ADMIN_SECRET>
 *
 * GET  /api/admin/affiliate-payouts?month=YYYY-MM         — download payout CSV
 * GET  /api/admin/affiliate-payouts-preview?month=YYYY-MM — JSON preview for UI
 * POST /api/admin/affiliate-mark-paid                     — mark earnings rows as paid
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db, affiliates, affiliateEarnings } from '@workspace/db';

const router = Router();

// ---------------------------------------------------------------------------
// Admin auth middleware
// ---------------------------------------------------------------------------

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: 'Admin access not configured (ADMIN_SECRET missing).' });
    return;
  }
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== adminSecret) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Parse month helper
// ---------------------------------------------------------------------------

function parseMonth(monthParam: string | undefined): { year: number; month: number } {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split('-').map(Number);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// ---------------------------------------------------------------------------
// GET /api/admin/affiliate-payouts?month=YYYY-MM  → CSV download
// ---------------------------------------------------------------------------

router.get(
  '/admin/affiliate-payouts',
  requireAdmin,
  async (req, res): Promise<void> => {
    const { year, month } = parseMonth(req.query.month as string | undefined);

    const rows = await db
      .select({
        affiliateId: affiliates.id,
        affiliateName: affiliates.name,
        affiliateEmail: affiliates.email,
        paypalEmail: affiliates.paypalEmail,
        totalCommissionCents: sql<number>`CAST(SUM(${affiliateEarnings.commissionCents}) AS integer)`,
      })
      .from(affiliateEarnings)
      .innerJoin(affiliates, eq(affiliateEarnings.affiliateId, affiliates.id))
      .where(
        and(
          eq(affiliateEarnings.periodMonth, month),
          eq(affiliateEarnings.periodYear, year),
          eq(affiliateEarnings.paid, false),
        ),
      )
      .groupBy(
        affiliates.id,
        affiliates.name,
        affiliates.email,
        affiliates.paypalEmail,
      )
      .having(sql`SUM(${affiliateEarnings.commissionCents}) >= 5000`);

    const escapeCSV = (val: string | null | undefined) => {
      const s = val ?? '';
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = 'affiliate_name,affiliate_email,paypal_email,amount_cents,currency,period_month,period_year';
    const csvRows = rows.map((r) =>
      [
        escapeCSV(r.affiliateName),
        escapeCSV(r.affiliateEmail),
        escapeCSV(r.paypalEmail),
        r.totalCommissionCents,
        'usd',
        month,
        year,
      ].join(','),
    );

    const csv = [header, ...csvRows].join('\n');
    const filename = `affiliate-payouts-${year}-${String(month).padStart(2, '0')}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/affiliate-payouts-preview?month=YYYY-MM  → JSON for the UI
// ---------------------------------------------------------------------------

router.get(
  '/admin/affiliate-payouts-preview',
  requireAdmin,
  async (req, res): Promise<void> => {
    const { year, month } = parseMonth(req.query.month as string | undefined);

    const rows = await db
      .select({
        affiliateId: affiliates.id,
        affiliateName: affiliates.name,
        affiliateEmail: affiliates.email,
        paypalEmail: affiliates.paypalEmail,
        totalCommissionCents: sql<number>`CAST(SUM(${affiliateEarnings.commissionCents}) AS integer)`,
      })
      .from(affiliateEarnings)
      .innerJoin(affiliates, eq(affiliateEarnings.affiliateId, affiliates.id))
      .where(
        and(
          eq(affiliateEarnings.periodMonth, month),
          eq(affiliateEarnings.periodYear, year),
          eq(affiliateEarnings.paid, false),
        ),
      )
      .groupBy(
        affiliates.id,
        affiliates.name,
        affiliates.email,
        affiliates.paypalEmail,
      )
      .having(sql`SUM(${affiliateEarnings.commissionCents}) >= 5000`);

    res.json({ year, month, rows });
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/affiliate-mark-paid  → mark earnings as paid
//
// Body: { affiliateIds: number[], month: string }  (month = "YYYY-MM")
// Marks all unpaid earnings for those affiliates in that month as paid.
// ---------------------------------------------------------------------------

router.post(
  '/admin/affiliate-mark-paid',
  requireAdmin,
  async (req, res): Promise<void> => {
    const { affiliateIds, month } = req.body as {
      affiliateIds?: unknown;
      month?: unknown;
    };

    if (!Array.isArray(affiliateIds) || affiliateIds.length === 0) {
      res.status(400).json({ error: 'affiliateIds must be a non-empty array.' });
      return;
    }

    const validAffiliateIds = affiliateIds.filter(
      (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0,
    );
    if (validAffiliateIds.length === 0) {
      res.status(400).json({ error: 'No valid affiliate IDs provided.' });
      return;
    }

    const { year, month: monthNum } = parseMonth(
      typeof month === 'string' ? month : undefined,
    );

    // Find all unpaid earning rows for these affiliates in this month
    const earningRows = await db
      .select({ id: affiliateEarnings.id })
      .from(affiliateEarnings)
      .where(
        and(
          inArray(affiliateEarnings.affiliateId, validAffiliateIds),
          eq(affiliateEarnings.periodMonth, monthNum),
          eq(affiliateEarnings.periodYear, year),
          eq(affiliateEarnings.paid, false),
        ),
      );

    if (earningRows.length === 0) {
      res.json({ success: true, updated: 0 });
      return;
    }

    const earningIds = earningRows.map((r) => r.id);
    await db
      .update(affiliateEarnings)
      .set({ paid: true })
      .where(inArray(affiliateEarnings.id, earningIds));

    req.log.info(
      { affiliateIds: validAffiliateIds, month: `${year}-${monthNum}`, rowsUpdated: earningIds.length },
      'Affiliate earnings marked as paid',
    );
    res.json({ success: true, updated: earningIds.length });
  },
);

export default router;
