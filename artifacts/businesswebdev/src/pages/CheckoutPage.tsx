import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Product = 'launch-package' | 'management-plan';

interface ProductMeta {
  label: string;
  price: string;
  description: string;
}

const PRODUCT_META: Record<Product, ProductMeta> = {
  'launch-package': {
    label: '30-Day Launch Package',
    price: '$2,500 — one-time',
    description:
      'A fixed-scope, 30-day project to build or substantially overhaul your site.',
  },
  'management-plan': {
    label: 'Website Management Plan',
    price: '$450/month — cancel anytime',
    description:
      'Ongoing management, improvements, and SEO for your live site.',
  },
};

// ---------------------------------------------------------------------------
// Inner form — mounted inside <Elements>
// ---------------------------------------------------------------------------

function PaymentForm({
  product,
  onBack,
}: {
  product: Product;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Build return URL from current origin + Vite base path
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

    // confirmPayment redirects on success — if we're still here, there was an error
    if (error) {
      setErrorMessage(
        error.message ?? 'Something went wrong. Please try again.',
      );
      setIsProcessing(false);
    }
  }

  const meta = PRODUCT_META[product];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product summary */}
      <div className="bg-muted/40 border border-border rounded-lg p-5">
        <p className="text-sm text-muted-foreground mb-1">{meta.description}</p>
        <p className="font-bold text-lg">{meta.price}</p>
      </div>

      {/* Payment Element */}
      <PaymentElement />

      {/* Error */}
      {errorMessage && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMessage}
        </p>
      )}

      {/* Trust line */}
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <LockKeyhole className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        Payments are processed securely via Stripe. This is a streamlined,
        self-serve checkout for founders who are ready to move quickly.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground text-base"
        >
          {isProcessing ? 'Processing…' : 'Pay now'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="sm:w-auto"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Outer page — fetches credentials, initialises Stripe, renders the form
// ---------------------------------------------------------------------------

export function CheckoutPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const productParam = params.get('product');

  // Validate product param
  const isValidProduct = (v: string | null): v is Product =>
    v === 'launch-package' || v === 'management-plan';

  const product: Product | null = isValidProduct(productParam)
    ? productParam
    : null;

  const [stripePromise, setStripePromise] = useState<ReturnType<
    typeof loadStripe
  > | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function goBack() {
    navigate('/');
  }

  useEffect(() => {
    if (!product) {
      setLoadError('Unknown product. Please go back and try again.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        const res = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? 'Failed to initialise checkout.');
        }

        const data = (await res.json()) as {
          clientSecret: string;
          publishableKey: string;
        };

        if (cancelled) return;

        setClientSecret(data.clientSecret);
        setStripePromise(loadStripe(data.publishableKey));
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load checkout.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [product]);

  const meta = product ? PRODUCT_META[product] : null;

  const elementsOptions: StripeElementsOptions = {
    clientSecret: clientSecret ?? undefined,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#4f46e5',
        borderRadius: '8px',
      },
    },
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 sm:px-8 py-4">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Product heading */}
          {meta && (
            <div className="mb-8">
              <div className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-3">
                {meta.label}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                Complete your purchase
              </h1>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground text-sm">
                Loading secure checkout…
              </p>
            </div>
          )}

          {/* Error */}
          {!loading && loadError && (
            <div className="text-center py-12">
              <p className="text-red-600 font-medium mb-2">
                Checkout unavailable
              </p>
              <p className="text-muted-foreground text-sm mb-6">{loadError}</p>
              <Button variant="outline" onClick={goBack}>
                Go back
              </Button>
            </div>
          )}

          {/* Payment form */}
          {!loading && !loadError && stripePromise && clientSecret && (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <PaymentForm product={product!} onBack={goBack} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
