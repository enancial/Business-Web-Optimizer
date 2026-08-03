import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { CheckCircle2, LayoutDashboard, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCAN_TOKEN_KEY } from '@/hooks/useAccountToken';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function Success() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const paymentIntentId = params.get('payment_intent');
  const setupIntentId = params.get('setup_intent');

  // Determine which flow completed
  const isTrial = Boolean(setupIntentId);

  // Exchange the Stripe intent ID for a signed scan token and store it.
  // - Trial (SetupIntent) path: ?setup_intent=seti_…
  // - Legacy (PaymentIntent) path: ?payment_intent=pi_…
  useEffect(() => {
    const intentId = setupIntentId ?? paymentIntentId;
    if (!intentId) return;
    void (async () => {
      try {
        const body = setupIntentId
          ? { setupIntentId }
          : { paymentIntentId };
        const res = await fetch(`${BASE}/api/issue-scan-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { token?: string };
        if (data.token) {
          localStorage.setItem(SCAN_TOKEN_KEY, data.token);
        }
      } catch {
        // Non-fatal — they can sign in at /account
      }
    })();
  }, [paymentIntentId, setupIntentId]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-6" />

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          {isTrial ? 'Your free trial has started!' : "You're subscribed!"}
        </h1>

        {isTrial ? (
          <>
            <div className="flex items-center justify-center gap-2 text-emerald-300 mb-4">
              <Calendar className="h-5 w-5 shrink-0" />
              <p className="text-lg font-semibold">No charge today</p>
            </div>
            <p className="text-slate-300 leading-relaxed mb-4">
              You have full access for the next 7 days. We'll charge your card automatically
              after your trial — cancel anytime from your account page before then and
              you won't be billed.
            </p>
          </>
        ) : (
          <p className="text-slate-300 leading-relaxed mb-4">
            Your payment was received and your subscription is now active. Check your inbox for a
            confirmation — your first scan report will be on its way shortly.
          </p>
        )}

        <p className="text-slate-400 text-sm mb-10">
          Questions?{' '}
          <a
            href="mailto:contact@businessweboptimizer.com"
            className="text-indigo-400 hover:text-indigo-300 underline transition-colors"
          >
            contact@businessweboptimizer.com
          </a>{' '}
          or call{' '}
          <a
            href="tel:+19844007773"
            className="text-indigo-400 hover:text-indigo-300 underline transition-colors whitespace-nowrap"
          >
            (984) 400‑7773
          </a>
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => navigate('/')}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Back to homepage
          </Button>

          <Button
            onClick={() => navigate('/account')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
            data-testid="button-manage-account"
          >
            <LayoutDashboard className="h-4 w-4" />
            View my account
          </Button>
        </div>
      </div>
    </div>
  );
}
