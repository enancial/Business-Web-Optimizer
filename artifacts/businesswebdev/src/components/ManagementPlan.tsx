import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle2, MinusCircle } from 'lucide-react';

const included = [
  'Up to 4 hours of site work (content, layout tweaks, small new sections)',
  'Basic SEO maintenance (titles, meta, internal links, simple schema)',
  'Monthly performance check (speed + basic analytics review)',
  'One round of copy refinement on a key page or new section',
  'Async email/Slack support (1–2 business day response)',
];

const notIncluded = [
  'Full redesigns or large feature builds',
  'Paid ads management',
  'Third-party costs (tools, software, paid assets)',
];

interface ManagementPlanProps {
  onCheckout: () => void;
}

export function ManagementPlan({ onCheckout }: ManagementPlanProps) {
  return (
    <section id="management-plan" className="py-20 bg-background">
      <div className="bwg-wrap">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4"
            data-testid="text-management-plan-headline"
          >
            Website Management Plan
          </h2>

          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Ongoing management, improvements, and SEO for any live site. A simple monthly plan so you always have a senior partner handling your website. This plan works for any live site — whether we just built/overhauled it together in the 30-Day Launch Package, or you already have an existing site you want managed and improved.
          </p>

          <div className="flex flex-wrap gap-4 mb-8">
            <div className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-bold text-xl">
              $450/month
            </div>
            <div className="bg-card border border-border px-6 py-3 rounded-lg font-medium text-muted-foreground">
              Cancel anytime with 30 days' notice
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-8 mb-6">
            <h3 className="font-semibold text-lg mb-6">What's included each month:</h3>
            <ul className="space-y-3 mb-8">
              {included.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3"
                  data-testid={`list-item-management-${index}`}
                >
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <h4 className="font-semibold text-base mb-4 text-muted-foreground">Not included:</h4>
            <ul className="space-y-2">
              {notIncluded.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3"
                  data-testid={`list-item-not-included-${index}`}
                >
                  <MinusCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button
            size="lg"
            onClick={onCheckout}
            className="w-full sm:w-auto  text-base px-10"
            data-testid="button-start-management-plan"
          >
            Start your Website Management Plan – $450/month
          </Button>

          <p className="text-sm text-muted-foreground mt-6 leading-relaxed">
            Starting with the 30-Day Launch Package? Most clients add this plan to keep their site sharp after launch. Existing-site clients can start here directly.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
