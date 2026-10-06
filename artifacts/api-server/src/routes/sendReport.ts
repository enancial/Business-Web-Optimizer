import { Router, type IRouter } from 'express';
import { eq } from 'drizzle-orm';
import { db, reportLeads } from '@workspace/db';
import { sendViaSmtp2go } from '../lib/smtp2go';

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Issue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

interface SendReportBody {
  email: string;
  url: string;
  score: number;
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityColor(severity: Issue['severity']): string {
  return severity === 'high' ? '#dc2626' : severity === 'medium' ? '#d97706' : '#2563eb';
}

function severityLabel(severity: Issue['severity']): string {
  return severity === 'high' ? 'High' : severity === 'medium' ? 'Medium' : 'Low';
}

function scoreColor(score: number): string {
  return score < 40 ? '#dc2626' : score < 70 ? '#d97706' : '#16a34a';
}

function buildEmailHtml(url: string, score: number, issues: Issue[]): string {
  const high = issues.filter((i) => i.severity === 'high').length;
  const med = issues.filter((i) => i.severity === 'medium').length;
  const low = issues.filter((i) => i.severity === 'low').length;

  const issueRows = issues
    .map(
      (issue) => `
    <tr>
      <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom: 6px;">
              <span style="
                display: inline-block;
                font-size: 11px;
                font-weight: 700;
                padding: 2px 8px;
                border-radius: 4px;
                border: 1px solid ${severityColor(issue.severity)}22;
                background: ${severityColor(issue.severity)}11;
                color: ${severityColor(issue.severity)};
                letter-spacing: 0.03em;
                text-transform: uppercase;
              ">${severityLabel(issue.severity)}</span>
            </td>
          </tr>
          <tr>
            <td style="font-size: 14px; font-weight: 600; color: #111827; padding-bottom: 4px;">${issue.title}</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #6b7280; line-height: 1.6;">${issue.detail}</td>
          </tr>
        </table>
      </td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Website Optimization Report</title>
</head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">

          <!-- Header -->
          <tr>
            <td style="background: #1a3a7a; border-radius: 12px 12px 0 0; padding: 32px 32px 28px;">
              <p style="margin: 0 0 4px; font-size: 13px; color: #93c5fd; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600;">Business Web Optimizer</p>
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #ffffff; line-height: 1.2;">Your Website Optimization Report</h1>
              <p style="margin: 0; font-size: 13px; color: #bfdbfe;">${url}</p>
            </td>
          </tr>

          <!-- Score band -->
          <tr>
            <td style="background: #ffffff; padding: 28px 32px; border-bottom: 1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280; font-weight: 500;">Overall Score</p>
                    <p style="margin: 0; font-size: 42px; font-weight: 800; color: ${scoreColor(score)}; line-height: 1;">${score}<span style="font-size: 20px; color: #9ca3af;">/100</span></p>
                  </td>
                  <td align="right" valign="middle">
                    <table cellpadding="0" cellspacing="4" border="0">
                      <tr>
                        <td style="font-size: 12px; font-weight: 600; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 3px 10px;">${high} High</td>
                        <td style="font-size: 12px; font-weight: 600; color: #d97706; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 3px 10px;">${med} Medium</td>
                        <td style="font-size: 12px; font-weight: 600; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 3px 10px;">${low} Low</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Issues -->
          <tr>
            <td style="background: #ffffff; padding: 0 32px 8px;">
              <p style="margin: 20px 0 12px; font-size: 13px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.05em;">Prioritized Issues</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                ${issueRows}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background: #ffffff; padding: 24px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #1a3a7a; border-radius: 10px; padding: 24px;">
                <tr>
                  <td>
                    <h3 style="margin: 0 0 8px; font-size: 17px; font-weight: 700; color: #ffffff;">Want the full report?</h3>
                    <p style="margin: 0 0 20px; font-size: 13px; color: #bfdbfe; line-height: 1.6;">Upgrade to Optimizer for the complete prioritized issue list, delivered to your inbox.</p>
                    <a href="https://businessweboptimizer.com/checkout?product=optimizer" style="
                      display: inline-block;
                      background: #ffffff;
                      color: #1a3a7a;
                      font-weight: 700;
                      font-size: 14px;
                      padding: 12px 28px;
                      border-radius: 8px;
                      text-decoration: none;
                    ">Get Optimizer — $29/mo →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; border-radius: 0 0 12px 12px; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                You received this because you requested a scan report at
                <a href="https://businessweboptimizer.com" style="color: #6b7280;">businessweboptimizer.com</a>.
                You won't receive further emails unless you request another scan.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// POST /api/send-report
// ---------------------------------------------------------------------------

/**
 * Sends the scan report to the provided email address via SMTP2Go.
 *
 * Body: { email: string, url: string, score: number, issues: Issue[] }
 */
router.post('/send-report', async (req, res): Promise<void> => {
  const { email, url, score, issues } = req.body as Partial<SendReportBody>;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required.' });
    return;
  }
  if (typeof score !== 'number') {
    res.status(400).json({ error: 'score is required.' });
    return;
  }
  if (!Array.isArray(issues)) {
    res.status(400).json({ error: 'issues array is required.' });
    return;
  }

  // Durable record first: the lead must survive even if every email below fails.
  let leadId: number | null = null;
  try {
    const rows = await db
      .insert(reportLeads)
      .values({ email, url, score: Math.round(score) })
      .returning({ id: reportLeads.id });
    leadId = rows[0]?.id ?? null;
  } catch (err) {
    req.log.error({ err, url }, 'Failed to store report lead');
  }

  const apiKey = process.env.SMTP2GO_API_KEY;
  if (!apiKey) {
    req.log.error({ leadId }, 'SMTP2GO_API_KEY is not set');
    await markLead(leadId, { reportStatus: 'failed', reportError: 'SMTP2GO_API_KEY not set' }, req.log);
    res.status(500).json({ error: 'Email service is not configured.' });
    return;
  }

  const sender =
    process.env.SMTP2GO_SENDER_EMAIL ?? 'report@businessweboptimizer.com';

  const html = buildEmailHtml(url, score, issues);

  const result = await sendViaSmtp2go(apiKey, {
    to: [email],
    sender,
    subject: `Your Website Optimization Report — Score: ${score}/100`,
    html_body: html,
  });

  await markLead(
    leadId,
    result.ok
      ? { reportStatus: 'sent', reportEmailId: result.emailId }
      : { reportStatus: 'failed', reportError: result.detail },
    req.log,
  );

  const ownerNotified = await notifyOwner(apiKey, sender, {
    leadId,
    email,
    url,
    score,
    reportDelivered: result.ok,
    reportError: result.ok ? undefined : result.detail,
  });
  if (ownerNotified) {
    await markLead(leadId, { ownerNotified: true }, req.log);
  } else if (leadId === null) {
    // Neither D1 nor the owner notice holds this lead; the log line is the last record.
    req.log.error({ email, url, score }, 'REPORT LEAD UNRECORDED: storage and owner notice both failed');
  } else {
    req.log.error({ leadId }, 'Report lead owner notification failed');
  }

  if (!result.ok) {
    if (result.unreachable) {
      req.log.error({ err: result.detail }, 'Failed to reach SMTP2Go API');
      res.status(502).json({ error: 'Could not reach email service.' });
      return;
    }
    req.log.error({ status: result.status, detail: result.detail }, 'SMTP2Go send failed');
    res.status(502).json({ error: `Email delivery failed: ${result.detail}` });
    return;
  }

  req.log.info({ leadId, url, score, ownerNotified }, 'Scan report email sent');
  res.json({ sent: true, stored: leadId !== null, leadId, ownerNotified });
});

async function markLead(
  leadId: number | null,
  patch: Partial<typeof reportLeads.$inferInsert>,
  log: { error: (obj: object, msg: string) => void },
): Promise<void> {
  if (leadId === null) return;
  try {
    await db.update(reportLeads).set(patch).where(eq(reportLeads.id, leadId));
  } catch (err) {
    log.error({ err, leadId }, 'Failed to update report lead');
  }
}

/**
 * Tells the business a report lead arrived. Returns false on any failure so
 * the caller can record it; never throws.
 */
async function notifyOwner(
  apiKey: string,
  sender: string,
  lead: {
    leadId: number | null;
    email: string;
    url: string;
    score: number;
    reportDelivered: boolean;
    reportError?: string;
  },
): Promise<boolean> {
  const to = process.env.LEAD_NOTIFY_EMAIL;
  if (!to) return false;
  const lines = [
    'Someone asked businessweboptimizer.com to email them a scan report.',
    '',
    `Email: ${lead.email}`,
    `Site scanned: ${lead.url}`,
    `Score: ${lead.score}/100`,
    `Report delivered to them: ${lead.reportDelivered ? 'yes' : `NO — ${lead.reportError ?? 'unknown error'}`}`,
    `Stored in D1 report_leads: ${lead.leadId === null ? 'NO — storage failed, this email is the only record' : `yes, id ${lead.leadId}`}`,
    '',
    'They asked for a report, not a sales follow-up. Establish a consent basis before any outreach.',
  ];
  const result = await sendViaSmtp2go(apiKey, {
    to: [to],
    sender,
    subject: `BWO report lead: ${lead.url} (score ${lead.score})`,
    text_body: lines.join('\n'),
  });
  return result.ok;
}

export default router;
