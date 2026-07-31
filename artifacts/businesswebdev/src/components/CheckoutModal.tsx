import { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { X } from 'lucide-react';

interface CheckoutModalProps {
  product: 'launch-package' | 'management-plan';
  onClose: () => void;
}

export function CheckoutModal({ product, onClose }: CheckoutModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<{ destroy: () => void } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Fetch publishable key from the API
        const configRes = await fetch('/api/checkout-config');
        if (!configRes.ok) throw new Error('Failed to load checkout config');
        const { publishableKey } = await configRes.json() as { publishableKey: string };
        if (!publishableKey) throw new Error('Checkout is not configured yet');

        // Create a checkout session on the server
        const sessionRes = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product }),
        });
        if (!sessionRes.ok) {
          const body = await sessionRes.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? 'Failed to create checkout session');
        }
        const { clientSecret } = await sessionRes.json() as { clientSecret: string };

        if (cancelled) return;

        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error('Failed to load Stripe.js');

        // @ts-expect-error — initEmbeddedCheckout exists in recent stripe-js but types may lag
        const checkout = await stripe.initEmbeddedCheckout({ clientSecret });

        if (cancelled) {
          checkout.destroy();
          return;
        }

        checkoutRef.current = checkout;

        if (containerRef.current) {
          checkout.mount(containerRef.current);
        }

        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load checkout');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, [product]);

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto p-4 sm:p-8"
      onClick={handleBackdrop}
    >
      <div className="relative bg-white rounded-2xl w-full max-w-2xl my-auto shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-white border border-gray-200 rounded-full shadow-md p-1.5 text-gray-500 hover:text-gray-800 transition-colors z-10"
          aria-label="Close checkout"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Loading state */}
        {loading && !error && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-500 text-sm">Loading secure checkout…</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="py-16 px-8 text-center">
            <p className="text-red-600 font-medium mb-2">Something went wrong</p>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <button
              onClick={onClose}
              className="text-indigo-600 underline text-sm"
            >
              Close and try again
            </button>
          </div>
        )}

        {/* Stripe embedded checkout mounts here — always in DOM */}
        <div
          ref={containerRef}
          className={loading || error ? 'hidden' : 'block'}
        />
      </div>
    </div>
  );
}
