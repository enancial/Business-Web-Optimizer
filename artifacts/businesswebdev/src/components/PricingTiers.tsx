import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Zap, Calendar } from 'lucide-react';

interface Tier {
  id: string;
  label: string;
  badge?: string;
  price: string;
  period?: string;
  trialNote?: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
  testId: string;
}

const tiers: Tier[] = [
  {
    id: 'free',
    label: 'Free',
    price: '$0',
    description: 'Scan up to 5 pages, see your top 3 issues. No credit card required.',
    features: [
      'Scan up to 5 pages',
      'Top 3 priority issues',
      'On-screen results only',
      'No credit card required',
    ],
    cta: 'Start Free Scan',
    href: '#optimizer-tool',
    testId: 'tier-free',
  },
  {
    id: 'optimizer',
    label: 'Optimizer',
    badge: 'Most Popular',
    price: '$29',
    period: '/mo',
    trialNote: '7-day free trial',
    description: 'Full site scan, deeper checks, exportable PDF report, monthly re-scan.',
    features: [
      'Unlimited page scans',
      '20+ optimization checks',
      'Prioritized issue list',
      'Exportable PDF report',
      'Monthly re-scan included',
      'Email delivery of report',
    ],
    cta: 'Start 7-day free trial',
    href: '/checkout?product=optimizer',
    highlighted: true,
    testId: 'tier-optimizer',
  },
  {
    id: 'optimizer-pro',
    label: 'Optimizer Pro',
    price: '$79',
    period: '/mo',
    trialNote: '7-day free trial',
    description: 'Everything in Optimizer, plus scheduled scans, competitor comparison, white-label reports, API access.',
    features: [
      'Everything in Optimizer',
      'Scheduled auto-scans',
      'Competitor site comparison',
      'White-label PDF reports',
      'API access',
      'Priority support',
    ],
    cta: 'Start 7-day free trial',
    href: '/checkout?product=optimizer-pro',
    testId: 'tier-optimizer-pro',
  },
];

export function PricingTiers() {
  return (
    <section id="pricing" className="py-20 bg-muted/30">
      <div className="bwg-wrap">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-14"
        >
          <div className="bwg-eyebrow">Plans and pricing</div>
          <h2
            className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4"
            data-testid="text-pricing-headline"
          >
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Start free. Try paid plans risk-free for 7 days. Cancel anytime.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative rounded-2xl p-8 flex flex-col ${
                tier.highlighted
                  ? 'bwg-on-navy bg-[var(--bwg-navy)] text-white shadow-2xl shadow-blue-900/30 ring-2 ring-primary'
                  : 'bg-card border border-border'
              }`}
              data-testid={tier.testId}
            >
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                    <Zap className="h-3 w-3" />
                    {tier.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <p className={`text-sm font-semibold uppercase tracking-wide mb-2 ${tier.highlighted ? 'text-blue-200' : 'text-muted-foreground'}`}>
                  {tier.label}
                </p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-4xl font-bold ${tier.highlighted ? 'text-white' : 'text-foreground'}`}>
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className={`text-base ${tier.highlighted ? 'text-blue-200' : 'text-muted-foreground'}`}>
                      {tier.period}
                    </span>
                  )}
                </div>
                {tier.trialNote && (
                  <div className={`flex items-center gap-1.5 text-xs font-semibold mb-3 ${tier.highlighted ? 'text-[var(--bwg-blue-on-navy)]' : 'text-primary'}`}>
                    <Calendar className="h-3 w-3" />
                    {tier.trialNote} — no charge today
                  </div>
                )}
                <p className={`text-sm leading-relaxed ${tier.highlighted ? 'text-blue-100' : 'text-muted-foreground'}`}>
                  {tier.description}
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CheckCircle2 className={`h-4 w-4 flex-shrink-0 mt-0.5 ${tier.highlighted ? 'text-[var(--bwg-blue-on-navy)]' : 'text-primary'}`} />
                    <span className={`text-sm ${tier.highlighted ? 'text-blue-50' : 'text-foreground'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                className={`w-full text-base font-semibold ${
                  tier.highlighted
                    ? 'bg-white text-primary hover:bg-blue-50'
                    : tier.id === 'free'
                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                    : ''
                }`}
                data-testid={`button-${tier.testId}`}
              >
                <a href={tier.href}>{tier.cta}</a>
              </Button>

              {tier.id !== 'free' && (
                <p className={`text-xs text-center mt-3 ${tier.highlighted ? 'text-blue-200' : 'text-muted-foreground'}`}>
                  Cancel before day 7 — no charge
                </p>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
