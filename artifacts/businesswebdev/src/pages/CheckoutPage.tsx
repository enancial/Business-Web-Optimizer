import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { ArrowLeft, LockKeyhole, Tag, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Product = 'optimizer' | 'optimizer-pro';

interface ProductMeta {
  label: string;
  price: string;
  description: string;
  unitAmount: number; // cents — displayed before API call
  currency: string;
}

const PRODUCT_META: Record<Product, ProductMeta> = {
  'optimizer': {
    label: 'Optimizer',
    price: '$29/month',
    description:
      'Full site scan, deeper checks, exportable PDF report, and monthly re-scan.',
    unitAmount: 2900,
    currency: 'usd',
  },
  'optimizer-pro': {
    label: 'Optimizer Pro',
    price: '$79/month',
    description:
      'Everything in Optimizer, plus scheduled scans, competitor comparison, white-label reports, and API access.',
    unitAmount: 7900,
    currency: 'usd',
  },
};

interface PromoResult {
  promotionCodeId: string;
  discountLabel: string;
  originalAmount: number;
  discountedAmount: number;
  currency: string;
  duration: string;
}

interface IntentResult {
  clientSecret?: string;
  publishableKey: string;
  isFree?: boolean;
  originalAmount: number;
  discountedAmount: number;
  currency: string;
  discountLabel?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

// ---------------------------------------------------------------------------
// Step 1 — Order summary + promo code
// ---------------------------------------------------------------------------

interface OrderStepProps {
  product: Product;
  onContinue: (promo: PromoResult | null) => void;
  onBack: () => void;
}

function OrderStep({ product, onContinue, onBack }: OrderStepProps) {
  const meta = PRODUCT_META[product];
  const [codeInput, setCodeInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);

  async function handleApplyPromo() {
    if (!codeInput.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    setPromoResult(null);
    try {
      const data = await apiFetch<PromoResult & { valid: boolean; error?: string }>(
        '/validate-promo',
        { code: codeInput.trim(), product },
      );
      if (!data.valid) throw new Error(data.error ?? 'Invalid code.');
      setPromoResult(data);
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setPromoLoading(false);
    }
  }

  function handleRemovePromo() {
    setPromoResult(null);
    setPromoError(null);
    setCodeInput('');
  }

  const displayAmount = promoResult
    ? promoResult.discountedAmount
    : meta.unitAmount;
  const displayCurrency = promoResult ? promoResult.currency : meta.currency;

  return (
    <div className="space-y-6">
      {/* Order summary */}
      <div className="bg-muted/40 border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">{meta.label}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {meta.description}
            </p>
          </div>
          <div className="text-right shrink-0">
            {promoResult ? (
              <>
                <p className="text-sm line-through text-muted-foreground">
                  {formatAmount(promoResult.originalAmount, promoResult.currency)}
                </p>
                <p className="font-bold text-green-700 text-lg">
                  {formatAmount(promoResult.discountedAmount, promoResult.currency)}
                </p>
              </>
            ) : (
              <p className="font-bold text-lg">{meta.price}</p>
            )}
          </div>
        </div>

        {promoResult && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <strong>{promoResult.discountLabel}</strong> applied
              {promoResult.duration === 'forever' ? ' — every month' : ''}
              {promoResult.duration === 'once' ? ' — first payment only' : ''}
            </span>
            <button
              onClick={handleRemovePromo}
              className="ml-auto text-xs underline opacity-70 hover:opacity-100"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Promo code input */}
      {!promoResult && (
        <div>
          <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Promo code
          </label>
          <div className="flex gap-2">
            <Input
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase());
                setPromoError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
              placeholder="Enter code"
              className="flex-1 uppercase font-mono tracking-widest"
              disabled={promoLoading}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleApplyPromo}
              disabled={promoLoading || !codeInput.trim()}
            >
              {promoLoading ? 'Checking…' : 'Apply'}
            </Button>
          </div>
          {promoError && (
            <p className="text-sm text-red-600 mt-1.5">{promoError}</p>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          type="button"
          onClick={() => onContinue(promoResult)}
          className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground text-base"
        >
          {displayAmount === 0
            ? 'Claim free access'
            : `Continue — ${formatAmount(displayAmount, displayCurrency)}/mo`}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} className="sm:w-auto">
          Cancel
        </Button>
      </div>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Payments are processed securely via Stripe.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Payment Element (paid orders only)
// ---------------------------------------------------------------------------

interface PaymentFormProps {
  product: Product;
  intentResult: IntentResult;
  onBack: () => void;
}

function PaymentForm({ product, intentResult, onBack }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const meta = PRODUCT_META[product];
  const returnUrl = new URL(
    'success',
    window.location.origin + import.meta.env.BASE_URL,
  ).href;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });

    if (error) {
      setErrorMessage(error.message ?? 'Something went wrong. Please try again.');
      setIsProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Amount summary */}
      <div className="bg-muted/40 border border-border rounded-lg p-5 space-y-1">
        <p className="text-sm text-muted-foreground">{meta.description}</p>
        <div className="flex items-baseline gap-2">
          {intentResult.discountLabel && (
            <span className="text-sm line-through text-muted-foreground">
              {formatAmount(intentResult.originalAmount, intentResult.currency)}
            </span>
          )}
          <span className="font-bold text-lg">
            {formatAmount(intentResult.discountedAmount, intentResult.currency)}/mo
          </span>
          {intentResult.discountLabel && (
            <span className="text-xs text-green-700 font-medium">
              ({intentResult.discountLabel})
            </span>
          )}
        </div>
      </div>

      {/* Stripe Payment Element */}
      <PaymentElement />

      {errorMessage && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMessage}
        </p>
      )}

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Payments are processed securely via Stripe. Cancel anytime.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground text-base"
        >
          {isProcessing ? 'Processing…' : 'Subscribe now'}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} className="sm:w-auto">
          Back
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CheckoutPage — outer shell
// ---------------------------------------------------------------------------

type CheckoutStep = 'order' | 'payment' | 'free-success';

export function CheckoutPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const productParam = params.get('product');

  const product: Product | null =
    productParam === 'optimizer' || productParam === 'optimizer-pro'
      ? productParam
      : null;

  const [step, setStep] = useState<CheckoutStep>('order');
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  const meta = product ? PRODUCT_META[product] : null;

  function goBack() {
    navigate('/');
  }

  function goBackToOrder() {
    setStep('order');
    setIntentResult(null);
    setStripePromise(null);
    setIntentError(null);
  }

  async function handleContinue(promo: PromoResult | null) {
    if (!product) return;
    setIntentLoading(true);
    setIntentError(null);

    try {
      const data = await apiFetch<IntentResult>('/create-payment-intent', {
        product,
        ...(promo ? { promotionCode: promo.promotionCodeId } : {}),
      });

      setIntentResult(data);

      if (data.isFree) {
        setStep('free-success');
        return;
      }

      // Load Stripe and mount Payment Element
      const sp = loadStripe(data.publishableKey);
      setStripePromise(sp);
      setStep('payment');
    } catch (err) {
      setIntentError(
        err instanceof Error ? err.message : 'Could not start checkout. Try again.',
      );
    } finally {
      setIntentLoading(false);
    }
  }

  // ── Invalid product param ────────────────────────────────────────────────
  if (!product || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Invalid product selected.</p>
          <Button variant="outline" onClick={goBack}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const elementsOptions: StripeElementsOptions = intentResult?.clientSecret
    ? { clientSecret: intentResult.clientSecret, appearance: { theme: 'stripe' } }
    : {};

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-4 sm:px-6 py-4 flex items-center gap-3">
        <button
          onClick={step === 'payment' ? goBackToOrder : goBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-sm">Secure Checkout</span>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Product heading */}
          <div className="mb-8">
            <div className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-3">
              {meta.label}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {step === 'free-success' ? 'You\'re all set!' : 'Complete your subscription'}
            </h1>
          </div>

          {/* Step: Order summary + promo */}
          {step === 'order' && (
            <>
              <OrderStep product={product} onContinue={handleContinue} onBack={goBack} />
              {intentLoading && (
                <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Starting secure checkout…
                </div>
              )}
              {intentError && (
                <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {intentError}
                </p>
              )}
            </>
          )}

          {/* Step: Free order confirmed */}
          {step === 'free-success' && intentResult && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
                <p className="font-semibold text-green-800">
                  Your {meta.label} subscription is confirmed at no charge.
                </p>
                <p className="text-sm text-green-700">
                  A {intentResult.discountLabel} promo code was applied — your total is $0.
                  {" You'll be notified before any charges if the discount changes."}
                </p>
              </div>
              <Button
                onClick={goBack}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Back to site
              </Button>
            </div>
          )}

          {/* Step: Payment Element */}
          {step === 'payment' && stripePromise && intentResult?.clientSecret && (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <PaymentForm
                product={product}
                intentResult={intentResult}
                onBack={goBackToOrder}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
