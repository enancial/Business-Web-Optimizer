import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

const included = [
  'One-page positioning doc (audience, promise, proof, offer, CTA)',
  'Copy refinement on homepage + one key page',
  'SEO basics: titles, meta, headings, simple schema',
  'Indexing & technical checklist (robots, sitemap, speed/UX tweaks)',
  'Connect/verify main social accounts',
  'UX/UI polish on key flows (signup, contact, pricing, onboarding)',
  'One-pager PDF or launch email + 2–3 social post drafts',
  'Loom walkthrough + short written report',
];

interface LaunchPackageProps {
  onCheckout: () => void;
}

export function LaunchPackage({ onCheckout }: LaunchPackageProps) {
  return (
    <section id="launch-package" className="py-20 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-block bg-primary/10 text-primary text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            30-Day Launch Package
          </div>

          <h2
            className="text-3xl sm:text-4xl font-bold mb-4"
            data-testid="text-launch-package-headline"
          >
            30-Day Launch Package
          </h2>

          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            A fixed-scope, 30-day project to build a new site or substantially overhaul/replace an existing site. This works for brand-new sites and for replacing or overhauling an existing site that isn't serving your business.
          </p>

          <div className="flex flex-wrap gap-4 mb-8">
            <div className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-bold text-xl">
              $2,500 (flat)
            </div>
            <div className="bg-card border border-border px-6 py-3 rounded-lg font-medium text-muted-foreground">
              30 days, fully async
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-8 mb-6">
            <h3 className="font-semibold text-lg mb-6">What's included:</h3>
            <ul className="space-y-3">
              {included.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3"
                  data-testid={`list-item-launch-${index}`}
                >
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-muted-foreground mb-8 italic">
            If you don't feel this materially improved your launch readiness, I'll refund 50%.
          </p>

          <Button
            size="lg"
            onClick={onCheckout}
            className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground text-base px-10"
            data-testid="button-start-launch-package"
          >
            Start your 30-Day Launch Package – $2,500
          </Button>

          <p className="text-sm text-muted-foreground mt-6 leading-relaxed">
            Many clients add the Website Management Plan afterward to keep their site sharp. You can also start both at the same time if you want ongoing management from day one.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
