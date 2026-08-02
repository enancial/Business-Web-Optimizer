import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

const cards = [
  {
    title: 'Want to try it before committing?',
    description:
      "Run a free scan on your homepage and see the top issues holding your site back. No credit card needed — just paste your URL and go.",
    cta: 'Start Free Scan',
    href: '#optimizer-tool',
    testId: 'card-free-trial',
  },
  {
    title: 'Ready to go deeper?',
    description:
      "Get a full-site scan, deeper checks, and an exportable PDF report. Choose Optimizer for monthly re-scans, or Optimizer Pro for scheduled scans, competitor comparisons, and API access.",
    cta: 'See Optimizer Plans',
    href: '#pricing',
    testId: 'card-paid-plan',
  },
];

export function WhichDoINeed() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl sm:text-4xl font-bold text-center mb-12"
          data-testid="text-which-do-i-need-headline"
        >
          Which Plan Do I Need?
        </motion.h2>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-3xl mx-auto">
          {cards.map((card, index) => (
            <motion.div
              key={card.testId}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group bg-card border border-border rounded-lg p-8 hover:shadow-lg transition-all duration-200"
              data-testid={card.testId}
            >
              <h3 className="text-xl font-semibold mb-4 text-foreground">
                {card.title}
              </h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {card.description}
              </p>
              <Button
                asChild
                variant="outline"
                className="w-full group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all"
                data-testid={`button-${card.testId}`}
              >
                <a href={card.href}>{card.cta}</a>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
