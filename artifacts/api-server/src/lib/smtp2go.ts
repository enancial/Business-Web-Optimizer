/**
 * Single SMTP2Go send path for the whole API.
 *
 * Uses /v3/email/batch (one email per call) rather than /v3/email/send: the
 * key this Worker holds is scoped to /email/batch only. The batch response is
 * `{ data: [{ email_id }] }` on success and `{ data: { error, error_code } }`
 * on failure, so success is judged on a returned email_id, never on HTTP 200.
 */

export const SMTP2GO_BATCH_URL = 'https://api.smtp2go.com/v3/email/batch';

export interface Smtp2goEmail {
  to: string[];
  sender: string;
  subject: string;
  html_body?: string;
  text_body?: string;
}

export type Smtp2goResult =
  | { ok: true; emailId: string }
  | { ok: false; status: number; detail: string; unreachable?: boolean };

export async function sendViaSmtp2go(
  apiKey: string,
  email: Smtp2goEmail,
): Promise<Smtp2goResult> {
  let res: Response;
  try {
    res = await fetch(SMTP2GO_BATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: JSON.stringify({ emails: [email] }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : String(err),
      unreachable: true,
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const data = (body as { data?: unknown } | null)?.data;
  const first = Array.isArray(data) ? (data[0] as { email_id?: string } | undefined) : undefined;
  if (res.ok && first?.email_id) {
    return { ok: true, emailId: first.email_id };
  }

  const errObj = !Array.isArray(data) ? (data as { error?: string } | undefined) : undefined;
  const detail =
    errObj?.error ??
    (body as { error?: string } | null)?.error ??
    (res.ok ? 'SMTP2Go returned no email_id' : `HTTP ${res.status}`);
  return { ok: false, status: res.status, detail };
}
