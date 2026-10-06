import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

// ---------------------------------------------------------------------------
// FAQ accordion item
// ---------------------------------------------------------------------------

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left font-medium text-foreground hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-gray-100 pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step item
// ---------------------------------------------------------------------------

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--bwg-navy)] text-white flex items-center justify-center text-sm font-bold">
        {n}
      </div>
      <p className="text-foreground leading-relaxed pt-1">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AffiliatesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      {/* ── Hero ── */}
      <section className="bwg-on-navy bg-[var(--bwg-navy)] text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block bg-white/10 text-white/90 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
            Affiliate Program
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">
            Business Web Optimizer Affiliate Program
          </h1>
          <p className="text-xl text-white/80 leading-relaxed">
            Earn 30% recurring commissions for every customer you refer — for their first 12 months.
          </p>
          <div className="flex flex-wrap justify-center gap-8 mt-10">
            {[
              { label: 'Commission rate', value: '30%' },
              { label: 'Duration', value: '12 months' },
              { label: 'Payout', value: 'Monthly' },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-bold">{value}</p>
                <p className="text-sm text-white/60 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-16">

        {/* ── What is the program ── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-4">What is the Optimizer affiliate program?</h2>
          <div className="text-muted-foreground leading-relaxed space-y-4">
            <p>
              If you recommend tools to founders, agencies, or anyone running a website, you can earn
              30% recurring commissions for every subscriber you refer to Business Web Optimizer — for
              their first 12 months.
            </p>
            <p>
              Optimizer helps founders and small teams automatically audit and improve their websites'
              performance, SEO, and accessibility. Users get a clear, prioritized list of fixes in under
              60 seconds, plus ongoing tracking and recommendations.
            </p>
            <p>
              You handle the recommendation; we handle the tracking, reporting, and payouts.
            </p>
          </div>
        </section>

        {/* ── Who this is for ── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-4">Who this is for</h2>
          <ul className="space-y-3 mb-4">
            {[
              'Agencies and consultants who recommend tools to clients',
              'Developers, marketers, and designers with an audience or network',
              'Content creators, newsletter authors, and community leaders in the founder/SMB space',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-foreground">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--bwg-navy)] shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            If you regularly suggest software or services to people running websites, this program is
            designed for you.
          </p>
        </section>

        {/* ── How it works ── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-6">How it works</h2>
          <div className="space-y-5">
            <Step n={1} text="Sign up using the form below." />
            <Step n={2} text="Get your unique referral links for: Optimizer ($29/mo) and Optimizer Pro ($79/mo)." />
            <Step n={3} text="Share your links in your content, emails, social posts, or 1:1 recommendations. Ready‑to‑use copy and banners are available in your dashboard." />
            <Step n={4} text="Track your referrals, conversions, and earnings in real time." />
            <Step n={5} text="Get paid monthly via PayPal or bank transfer (minimum $50)." />
          </div>
          <p className="mt-6 text-sm text-muted-foreground bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
            Commissions are 30% of net revenue per invoice, for the first 12 months per referred subscriber.
          </p>
        </section>

        {/* ── What you'll earn ── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-4">What you'll earn</h2>
          <ul className="space-y-3 mb-5">
            {[
              '30% recurring commission on every referred Optimizer or Optimizer Pro subscriber.',
              'Applies to: Optimizer at $29/month; Optimizer Pro at $79/month.',
              'Commissions accrue for the first 12 months of each subscriber\'s lifetime.',
              'Monthly payouts once your unpaid balance reaches at least $50.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-foreground">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--bwg-navy)] shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 leading-relaxed">
            <strong>Example earnings:</strong> If you refer 10 Optimizer subscribers who stay active,
            you could earn roughly $87 per month in recurring commissions. With 10 Optimizer Pro
            subscribers, that could be around $237 per month. Actual earnings depend on conversions
            and churn.
          </div>
        </section>

        {/* ── What affiliates get ── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-4">What affiliates get</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-3">
            {[
              'Unique referral links for Optimizer and Optimizer Pro',
              'A live dashboard with: active referrals; total, current month, and unpaid earnings; paid earnings history',
              'Promo materials: pre‑written copy for emails and social posts; banner templates and text snippets',
              'Monthly payouts via PayPal or bank transfer (minimum $50)',
              'The ability to update your payout email directly from your dashboard',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 text-foreground">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-green-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-6">Frequently asked questions</h2>
          <div className="space-y-3">
            {[
              {
                q: 'When do I get paid?',
                a: 'Monthly, once your unpaid commissions reach at least $50. Payouts are processed after the end of each month.',
              },
              {
                q: 'How are referrals tracked?',
                a: 'Via your unique referral link. We track signups and subscriptions automatically and attribute commissions to your account.',
              },
              {
                q: 'Do I get credited for trials?',
                a: 'Yes. When someone starts a 7‑day free trial through your link and later converts to a paid plan, you\'re credited as the referring affiliate. Commissions accrue on paid invoices.',
              },
              {
                q: 'Can I update my payout email?',
                a: 'Yes. You can set or change your PayPal email from your affiliate dashboard at any time.',
              },
              {
                q: 'Are there restrictions on how I can promote Optimizer?',
                a: 'Affiliates must comply with our affiliate terms (no spam, no misleading claims, no unauthorized use of our brand in paid search, etc.). Full details are provided when you join.',
              },
            ].map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="text-center bg-[var(--bwg-navy)]/5 border border-[var(--bwg-line-strong)]/10 rounded-2xl py-12 px-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">Ready to start earning?</h2>
          <p className="text-muted-foreground mb-8">Join the program and get your referral links in minutes.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild className="bg-[var(--bwg-navy)] hover:bg-primary text-white h-11 px-8 text-base">
              <a href="/affiliates/join">Join the affiliate program →</a>
            </Button>
            <a
              href="/affiliates/dashboard"
              className="text-sm text-primary hover:underline"
            >
              Already an affiliate? Log in to your dashboard
            </a>
          </div>
        </section>

      </div>

      <Footer />
    </div>
  );
}
