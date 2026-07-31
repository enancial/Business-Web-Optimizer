import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
const faqs = [
  {
    question: 'Do I need to get on a call?',
    answer:
      'No. Everything is handled asynchronously via a short onboarding form, email, and video updates. This keeps things fast and focused. Calls are not required.',
  },
  {
    question: 'What if I need more than the package includes?',
    answer:
      'We can discuss a custom add-on or a future project after the initial work. The packages are designed to cover the most important foundational work without scope creep.',
  },
  {
    question: "What if I'm not satisfied with the 30-Day Launch Package?",
    answer:
      "If you don't feel the work materially improved your launch readiness, I'll refund 50% of your investment. I want this to be obviously valuable for you.",
  },
  {
    question:
      'Can I start with the Website Management Plan without doing the 30-Day Launch Package?',
    answer:
      "Yes. If your site and messaging are already solid, the Website Management Plan works well on its own. If you're still shaping your offer or site, the 30-Day Launch Package is usually the better starting point.",
  },
  {
    question:
      'I already have a website. Can the 30-Day Launch Package replace or overhaul it?',
    answer:
      'Yes. The 30-Day Launch Package is used both for brand-new sites and for replacing or substantially improving existing sites. If your current site is weak, outdated, or not converting, we can treat it as a full overhaul.',
  },
  {
    question:
      'If I start with the 30-Day Launch Package, can I add the Website Management Plan later?',
    answer:
      'Yes. Many clients start with the 30-Day Launch Package and then add the Website Management Plan once the foundation is in place. You can also choose to start both at the same time if you want ongoing management from day one.',
  },
  {
    question: 'How do payments work?',
    answer:
      "Payments are handled securely via Stripe. For the 30-Day Launch Package, you can pay in full or split 50/50 (upfront and on delivery). The Website Management Plan is billed monthly and can be canceled anytime with 30 days' notice.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-20 bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="text-3xl sm:text-4xl font-bold mb-12 text-center"
            data-testid="text-faq-headline"
          >
            FAQ
          </h2>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-card border border-border rounded-lg px-6"
                data-testid={`faq-item-${index}`}
              >
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
