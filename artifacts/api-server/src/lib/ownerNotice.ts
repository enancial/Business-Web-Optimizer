/**
 * Owner notices for lifecycle events nobody was told about (funnel audit
 * 2026-09-29): a trial whose card was confirmed, a cancellation scheduled or
 * reversed, a subscription that ended, and a new affiliate.
 *
 * Internal only: always sent to LEAD_NOTIFY_EMAIL, never to a customer.
 * Never throws. A failed notice is logged and must not fail the webhook or
 * the request that triggered it — the Stripe object / D1 row is the record,
 * this is only the alert.
 */
import { sendViaSmtp2go } from './smtp2go';

interface NoticeLog {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export async function notifyOwnerEvent(
  subject: string,
  lines: string[],
  log: NoticeLog,
): Promise<boolean> {
  try {
    const to = process.env.LEAD_NOTIFY_EMAIL;
    const apiKey = process.env.SMTP2GO_API_KEY;
    if (!to || !apiKey) {
      log.error({ subject, hasTo: Boolean(to), hasKey: Boolean(apiKey) }, 'Owner notice not configured');
      return false;
    }
    const sender = process.env.SMTP2GO_SENDER_EMAIL ?? 'report@businessweboptimizer.com';
    const result = await sendViaSmtp2go(apiKey, {
      to: [to],
      sender,
      subject: `BWO: ${subject}`,
      text_body: [...lines, '', '— automated notice from businessweboptimizer.com'].join('\n'),
    });
    if (!result.ok) {
      log.error({ subject, status: result.status, detail: result.detail }, 'Owner notice failed');
      return false;
    }
    log.info({ subject, emailId: result.emailId }, 'Owner notice sent');
    return true;
  } catch (err) {
    log.error({ subject, err: err instanceof Error ? err.message : String(err) }, 'Owner notice threw');
    return false;
  }
}
