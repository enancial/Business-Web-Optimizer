import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  loadStripe,
  type StripeElementsOptions,
} from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  CreditCard,
  Calendar,
  Zap,
  FileText,
  LogOut,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccountToken } from '@/hooks/useAccountToken';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountData {
  customer: { email: string; name: string | null };
  subscription: {
    id: string;
    status: string;
    plan: 'optimizer' | 'optimizer-pro';
    planLabel: string;
    currentPeriodEnd: number;
    trialEnd: number | null;
    amount: number;
    currency: string;
    cancelAtPeriodEnd: boolean;
    cancelAt: number | null;
  } | null;
  paymentMethod: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  invoices: Array<{
    id: string;
    number: string | null;
    amount: number;
    currency: string;
    date: number;
    status: string;
    pdfUrl: string | null;
    hostedUrl: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtDateShort(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  trialing: 'bg-blue-100 text-blue-800 border-blue-200',
  past_due: 'bg-red-100 text-red-800 border-red-200',
  canceled: 'bg-gray-100 text-gray-600 border-gray-200',
  incomplete: 'bg-amber-100 text-amber-800 border-amber-200',
  unpaid: 'bg-red-100 text-red-800 border-red-200',
};

// ---------------------------------------------------------------------------
// Email auth gate
// ---------------------------------------------------------------------------

type AuthError =
  | { code: 'not_found'; message: string }
  | { code: 'subscription_inactive'; message: string }
  | { code: 'no_subscription'; message: string }
  | { code: 'generic'; message: string };

function AuthErrorBanner({ err }: { err: AuthError }) {
  if (err.code === 'subscription_inactive') {
    return (
      <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
        <div className="flex items-start gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-medium">Your trial or subscription is no longer active.</span>
        </div>
        <p className="mt-1.5 text-amber-700 text-xs leading-relaxed">
          To regain access, start a new subscription or{' '}
          <a href="mailto:contact@businessweboptimizer.com" className="underline font-medium">
            contact support
          </a>{' '}
          if you think this is a mistake.
        </p>
      </div>
    );
  }

  if (err.code === 'not_found') {
    return (
      <div className="text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
        <div className="flex items-start gap-2 text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-medium">We couldn't find an account with that email.</span>
        </div>
        <p className="mt-1.5 text-red-600 text-xs leading-relaxed">
          Double-check for typos and try again. Use the email you entered at checkout.
        </p>
      </div>
    );
  }

  if (err.code === 'no_subscription') {
    return (
      <div className="text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
        <div className="flex items-start gap-2 text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-medium">No Optimizer subscription found for that email.</span>
        </div>
        <p className="mt-1.5 text-red-600 text-xs leading-relaxed">
          Make sure you're using the email you signed up with, or{' '}
          <a href="mailto:contact@businessweboptimizer.com" className="underline font-medium">
            contact support
          </a>{' '}
          for help.
        </p>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      {err.message}
    </div>
  );
}

function AuthGate({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/account/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { token?: string; error?: string; errorCode?: string };
      if (!res.ok || !data.token) {
        const message = data.error ?? 'Could not verify your account. Please try again.';
        const code = data.errorCode;
        if (code === 'not_found' || code === 'subscription_inactive' || code === 'no_subscription') {
          setError({ code, message });
        } else {
          setError({ code: 'generic', message });
        }
        return;
      }
      onSuccess(data.token);
    } catch {
      setError({ code: 'generic', message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1A3A7A]/10 mb-4">
            <Zap className="h-7 w-7 text-[#1A3A7A]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign in to your account</h1>
          <p className="text-gray-500 mt-2 text-sm">Enter the email you used at checkout.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm"
        >
          <div className="mb-4">
            <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email address
            </label>
            <Input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11"
              autoFocus
            />
          </div>

          {error && <AuthErrorBanner err={error} />}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1A3A7A] hover:bg-[#1565D6] text-white h-11"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Access my account →'}
          </Button>

          <p className="text-xs text-gray-400 text-center mt-4">
            Enter the email you used to start your free trial or subscription.
          </p>
        </form>

        <p className="text-center mt-6 text-sm text-gray-500">
          Questions?{' '}
          <a href="mailto:contact@businessweboptimizer.com" className="text-[#1565D6] hover:underline">
            contact@businessweboptimizer.com
          </a>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update payment method inline form
// ---------------------------------------------------------------------------

function PaymentUpdateForm({
  clientSecret,
  token,
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError('');

    const { setupIntent, error: stripeError } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });

    if (stripeError) {
      setError(stripeError.message ?? 'Card setup failed.');
      setLoading(false);
      return;
    }

    const pmId =
      typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : null;

    if (!pmId) {
      setError('Could not retrieve payment method. Please try again.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${BASE}/api/account/set-default-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentMethodId: pmId }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not save payment method.');
        setLoading(false);
        return;
      }
      onSuccess();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading || !stripe} className="bg-[#1A3A7A] hover:bg-[#1565D6] text-white">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save new card'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data, isLoading, error: fetchError } = useQuery<AccountData>({
    queryKey: ['account', token],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/account`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to load account.');
      }
      return res.json() as Promise<AccountData>;
    },
    retry: 1,
  });

  // Action states
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [showPlanChange, setShowPlanChange] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);

  // Update payment method
  const [setupIntent, setSetupIntent] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [pmSuccess, setPmSuccess] = useState(false);

  // Re-issue token
  const [reissueLoading, setReissueLoading] = useState(false);
  const [reissueMsg, setReissueMsg] = useState('');

  // Mutations
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/account/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Could not cancel.');
      }
      return res.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['account'] }); setCancelConfirm(false); },
  });

  const uncancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/account/uncancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = (await res.json()) as { error?: string }; throw new Error(d.error ?? 'Error'); }
      return res.json();
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['account'] }),
  });

  const changePlanMutation = useMutation({
    mutationFn: async (plan: string) => {
      const res = await fetch(`${BASE}/api/account/change-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const d = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Could not change plan.');
      return d;
    },
    onSuccess: (d) => {
      if (d.token) { localStorage.setItem('bwo_scan_token', d.token); }
      void qc.invalidateQueries({ queryKey: ['account'] });
      setShowPlanChange(false);
    },
  });

  async function startPaymentUpdate() {
    setPmSuccess(false);
    const res = await fetch(`${BASE}/api/account/update-payment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = (await res.json()) as { clientSecret?: string; publishableKey?: string; error?: string };
    if (!res.ok || !d.clientSecret || !d.publishableKey) return;
    setSetupIntent({ clientSecret: d.clientSecret, publishableKey: d.publishableKey });
    setStripePromise(loadStripe(d.publishableKey));
  }

  async function reissueToken() {
    setReissueLoading(true);
    setReissueMsg('');
    try {
      const res = await fetch(`${BASE}/api/account/re-issue-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !d.token) { setReissueMsg(d.error ?? 'Could not re-issue token.'); return; }
      localStorage.setItem('bwo_scan_token', d.token);
      setReissueMsg('✓ Scan access refreshed for another 30 days.');
    } catch { setReissueMsg('Network error. Try again.'); }
    finally { setReissueLoading(false); }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-[#1565D6] animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
        <p className="text-gray-700 mb-4">{(fetchError as Error).message}</p>
        <Button variant="outline" onClick={onSignOut}>Sign out</Button>
      </div>
    );
  }

  if (!data) return null;

  const { customer, subscription, paymentMethod, invoices } = data;
  const tokenExpTs = (() => {
    try {
      const parts = token.split('.');
      const p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      return p.exp ?? null;
    } catch { return null; }
  })();

  const elementsOptions: StripeElementsOptions = setupIntent
    ? { clientSecret: setupIntent.clientSecret, appearance: { theme: 'stripe' } }
    : {};

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-gray-500 mb-0.5">{customer.email}</p>
          <h1 className="text-2xl font-bold text-gray-900">Your Account</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-700 gap-1.5"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-gray-600"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Plan card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Current plan</p>
              {subscription ? (
                <>
                  <h2 className="text-xl font-bold text-gray-900">{subscription.planLabel}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[subscription.status] ?? STATUS_STYLES['active']}`}
                    >
                      {subscription.status === 'trialing' ? 'Free trial' : subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                    </span>
                    {subscription.cancelAtPeriodEnd && (
                      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-medium">
                        {subscription.status === 'trialing'
                          ? `Trial canceled — access until ${fmtDate(subscription.trialEnd ?? subscription.cancelAt ?? subscription.currentPeriodEnd)}`
                          : `Cancels ${fmtDate(subscription.cancelAt ?? subscription.currentPeriodEnd)}`}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <h2 className="text-xl font-bold text-gray-900">Free Trial</h2>
              )}
            </div>
            {subscription && (
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-gray-900">
                  {fmt(subscription.amount, subscription.currency)}
                </p>
                <p className="text-sm text-gray-400">per month</p>
              </div>
            )}
          </div>

          {subscription && (
            <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col sm:flex-row gap-4">
              {subscription.status === 'trialing' && subscription.trialEnd ? (
                <>
                  {/* Trial countdown */}
                  {(() => {
                    const daysLeft = Math.ceil(((subscription.trialEnd * 1000) - Date.now()) / 86_400_000);
                    return (
                      <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                        <Calendar className="h-4 w-4 shrink-0 text-blue-500" />
                        {subscription.cancelAtPeriodEnd
                          ? `Trial ends ${fmtDate(subscription.trialEnd)} — no charge`
                          : daysLeft <= 1
                            ? `Trial ends today — you'll be charged ${fmt(subscription.amount, subscription.currency)}/mo tomorrow`
                            : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in your free trial — first charge on ${fmtDate(subscription.trialEnd)}`}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                  {subscription.cancelAtPeriodEnd
                    ? `Access ends ${fmtDate(subscription.cancelAt ?? subscription.currentPeriodEnd)}`
                    : `Next billing date: ${fmtDate(subscription.currentPeriodEnd)}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scan access card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Scan access</p>
              {tokenExpTs ? (
                <>
                  <p className="font-semibold text-gray-900">
                    {tokenExpTs * 1000 > Date.now()
                      ? `Valid until ${fmtDate(tokenExpTs)}`
                      : 'Access expired'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tokens refresh every 30 days for paid subscribers.
                  </p>
                </>
              ) : (
                <p className="font-semibold text-gray-900">No scan token stored</p>
              )}
            </div>
            <div className="shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={reissueToken}
                disabled={reissueLoading || !subscription}
              >
                {reissueLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh token
              </Button>
            </div>
          </div>
          {reissueMsg && (
            <p className={`mt-3 text-sm px-4 py-2 rounded-lg border ${reissueMsg.startsWith('✓') ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
              {reissueMsg}
            </p>
          )}
        </div>

        {/* Payment method */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Payment method</p>
              {paymentMethod ? (
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900 capitalize">{paymentMethod.brand}</span>
                  <span className="text-gray-500">···· {paymentMethod.last4}</span>
                  <span className="text-xs text-gray-400">
                    {paymentMethod.expMonth}/{String(paymentMethod.expYear).slice(-2)}
                  </span>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No payment method on file.</p>
              )}
            </div>
            {!setupIntent && (
              <Button size="sm" variant="outline" onClick={startPaymentUpdate} className="shrink-0">
                Update
              </Button>
            )}
          </div>

          {setupIntent && stripePromise && (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <PaymentUpdateForm
                clientSecret={setupIntent.clientSecret}
                token={token}
                onSuccess={() => {
                  setSetupIntent(null);
                  setPmSuccess(true);
                  void qc.invalidateQueries({ queryKey: ['account'] });
                }}
                onCancel={() => setSetupIntent(null)}
              />
            </Elements>
          )}
          {pmSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mt-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Payment method updated successfully.
            </div>
          )}
        </div>

        {/* Plan change */}
        {subscription && !subscription.cancelAtPeriodEnd && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setShowPlanChange(!showPlanChange)}
            >
              <p className="font-semibold text-gray-900">Change plan</p>
              {showPlanChange ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {showPlanChange && (
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                {(['optimizer', 'optimizer-pro'] as const).map((plan) => {
                  const isCurrent = subscription.plan === plan;
                  const label = plan === 'optimizer' ? 'Optimizer' : 'Optimizer Pro';
                  const price = plan === 'optimizer' ? '$29/mo' : '$79/mo';
                  const desc = plan === 'optimizer'
                    ? 'Full scan, deeper checks, PDF report, monthly re-scan.'
                    : 'Everything in Optimizer + competitor comparison, white-label reports, API access.';
                  return (
                    <div
                      key={plan}
                      className={`border rounded-xl p-4 ${isCurrent ? 'border-[#1565D6] bg-blue-50' : 'border-gray-200'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-900">{label}</span>
                        {isCurrent && <span className="text-xs font-medium text-[#1565D6] bg-blue-100 px-2 py-0.5 rounded-full">Current</span>}
                      </div>
                      <p className="text-sm text-gray-500 mb-3">{desc}</p>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">{price}</span>
                        {!isCurrent && (
                          <Button
                            size="sm"
                            onClick={() => changePlanMutation.mutate(plan)}
                            disabled={changePlanMutation.isPending}
                            className="bg-[#1A3A7A] hover:bg-[#1565D6] text-white"
                          >
                            {changePlanMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Switch'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {changePlanMutation.isError && (
              <p className="mt-3 text-sm text-red-600">{(changePlanMutation.error as Error).message}</p>
            )}
            {changePlanMutation.isSuccess && (
              <p className="mt-3 text-sm text-green-700">✓ Plan changed successfully.</p>
            )}
          </div>
        )}

        {/* Invoices */}
        {invoices.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <button
              className="flex items-center justify-between w-full text-left mb-2"
              onClick={() => setShowInvoices(!showInvoices)}
            >
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400" />
                Invoices ({invoices.length})
              </p>
              {showInvoices ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {showInvoices && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="pb-2 text-left font-medium">Date</th>
                      <th className="pb-2 text-left font-medium">Invoice</th>
                      <th className="pb-2 text-left font-medium">Amount</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-right font-medium">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="text-gray-700">
                        <td className="py-2.5">{fmtDateShort(inv.date)}</td>
                        <td className="py-2.5 font-mono text-xs text-gray-500">{inv.number ?? inv.id.slice(-8)}</td>
                        <td className="py-2.5 font-medium">{fmt(inv.amount, inv.currency)}</td>
                        <td className="py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${inv.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          {inv.pdfUrl ? (
                            <a
                              href={inv.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#1565D6] hover:underline text-xs"
                            >
                              PDF <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : inv.hostedUrl ? (
                            <a
                              href={inv.hostedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#1565D6] hover:underline text-xs"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Cancel / Uncancel */}
        {subscription && (
          <div className="bg-white border border-red-100 rounded-2xl p-6 shadow-sm">
            {subscription.status === 'trialing' ? (
              /* ── Trial cancel section ─────────────────────────────────── */
              subscription.cancelAtPeriodEnd ? (
                <>
                  <p className="font-semibold text-gray-900 mb-1">Keep your trial</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Your trial is set to end early on{' '}
                    {fmtDate(subscription.trialEnd ?? subscription.cancelAt ?? subscription.currentPeriodEnd)}.
                    You won't be charged. Resume to keep access and be billed at the end of your trial.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => uncancelMutation.mutate()}
                    disabled={uncancelMutation.isPending}
                  >
                    {uncancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Keep my trial'}
                  </Button>
                </>
              ) : cancelConfirm ? (
                <>
                  <p className="font-semibold text-gray-900 mb-1">Cancel your free trial?</p>
                  <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                    <span>
                      <strong>You won't be charged.</strong> You'll keep full access until{' '}
                      {fmtDate(subscription.trialEnd ?? subscription.currentPeriodEnd)}, then your trial ends with no payment taken.
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, cancel trial'}
                    </Button>
                    <Button variant="outline" onClick={() => setCancelConfirm(false)}>
                      Never mind
                    </Button>
                  </div>
                  {cancelMutation.isError && (
                    <p className="mt-2 text-sm text-red-600">{(cancelMutation.error as Error).message}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900 mb-1">Cancel trial</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Cancel before {fmtDate(subscription.trialEnd ?? subscription.currentPeriodEnd)} and you won't be charged a thing.
                    You keep full access until your trial ends.
                  </p>
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setCancelConfirm(true)}
                    data-testid="button-cancel-trial"
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5" />
                    Cancel trial
                  </Button>
                </>
              )
            ) : (
              /* ── Regular subscription cancel section ──────────────────── */
              <>
                <p className="font-semibold text-gray-900 mb-1">
                  {subscription.cancelAtPeriodEnd ? 'Keep your subscription' : 'Cancel subscription'}
                </p>
                {subscription.cancelAtPeriodEnd ? (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Your subscription is scheduled to cancel on {fmtDate(subscription.cancelAt ?? subscription.currentPeriodEnd)}. You can keep access by resuming now.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => uncancelMutation.mutate()}
                      disabled={uncancelMutation.isPending}
                    >
                      {uncancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume subscription'}
                    </Button>
                  </>
                ) : cancelConfirm ? (
                  <>
                    <p className="text-sm text-red-600 mb-4">
                      Your access will continue until {fmtDate(subscription.currentPeriodEnd)}, then end. This cannot be undone without resubscribing.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        variant="destructive"
                        onClick={() => cancelMutation.mutate()}
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, cancel my plan'}
                      </Button>
                      <Button variant="outline" onClick={() => setCancelConfirm(false)}>
                        Never mind
                      </Button>
                    </div>
                    {cancelMutation.isError && (
                      <p className="mt-2 text-sm text-red-600">{(cancelMutation.error as Error).message}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Cancels at end of current billing period. You keep access until then.
                    </p>
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setCancelConfirm(true)}
                    >
                      <AlertTriangle className="h-4 w-4 mr-1.5" />
                      Cancel subscription
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccountPage — main export
// ---------------------------------------------------------------------------

export function AccountPage() {
  const { tokenInfo, loaded, saveToken, clearToken } = useAccountToken();

  // Show auth gate if not logged in or token is expired
  const needsAuth = loaded && (!tokenInfo || !tokenInfo.isValid);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#1565D6] animate-spin" />
      </div>
    );
  }

  if (needsAuth) {
    return (
      <AuthGate
        onSuccess={(token) => {
          saveToken(token);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Dashboard token={tokenInfo!.raw} onSignOut={clearToken} />
    </div>
  );
}
