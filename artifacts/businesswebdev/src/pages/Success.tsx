import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function Success() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const paymentIntentId = params.get('payment_intent');

  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');

  async function openBillingPortal() {
    if (!paymentIntentId) return;
    setPortalLoading(true);
    setPortalError('');
    try {
      const res = await fetch(`${BASE}/api/billing-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setPortalError(data.error ?? 'Could not open billing portal. Please try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setPortalError('Network error — could not reach billing portal.');
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-6" />

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          You're subscribed!
        </h1>

        <p className="text-slate-300 leading-relaxed mb-4">
          Your payment was received and your subscription is now active. Check your inbox for a
          confirmation — your first scan report will be on its way shortly.
        </p>

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

          {/* Only show Manage subscription when we have a payment_intent param */}
          {paymentIntentId && (
            <Button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
              data-testid="button-manage-subscription"
            >
              {portalLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening…
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Manage subscription
                </>
              )}
            </Button>
          )}
        </div>

        {portalError && (
          <p className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-800 rounded px-4 py-2">
            {portalError}
          </p>
        )}
      </div>
    </div>
  );
}
