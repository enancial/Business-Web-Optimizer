import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

const cards = [
  {
    title: 'Need a new or overhauled site?',
    description:
      "You don't have a site, or your current one is weak, outdated, or not converting. You want a solid foundation that actually supports your business.",
    cta: 'Start with the 30-Day Launch Package',
    href: '#launch-package',
    testId: 'card-new-site',
  },
  {
    title: 'Already have a site, want someone to manage it?',
    description:
      "Your site is live, but you want a senior partner to handle improvements, SEO, and ongoing changes. You'd rather not juggle freelancers or agencies.",
    cta: 'Start with the Website Management Plan',
    href: '#management-plan',
    testId: 'card-manage-site',
  },
  {
    title: 'Want both foundation and ongoing management?',
    description:
      'You want the site built or overhauled correctly from the start, and you also want someone to keep it sharp and improving every month.',
    cta: 'See both options',
    href: '#how-they-work-together',
    testId: 'card-both',
  },
];

export function WhichDoINeed() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl sm:text-4xl font-bold text-center mb-12"
          data-testid="text-which-do-i-need-headline"
        >
          Which Do I Need?
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
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
