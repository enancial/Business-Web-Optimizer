import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    question: 'Who is Business Web Optimizer for?',
    answer:
      'Business Web Optimizer is built for founders and small business owners who want to know exactly what\'s holding their website back — without hiring an agency or waiting weeks for an audit. If you have a live site and want clear, actionable fixes, this is for you.',
  },
  {
    question: 'What does the Optimizer analyze?',
    answer:
      'The scan checks for clarity and value proposition issues, missing or weak CTAs, page load speed, SEO fundamentals (meta tags, heading structure, sitemap), mobile usability, social proof gaps, Open Graph tags, form UX, and more. Paid plans cover 20+ checks across your full site.',
  },
  {
    question: 'How long does a scan take?',
    answer:
      'Most scans complete in under 60 seconds. Larger sites with many pages may take slightly longer on paid plans.',
  },
  {
    question: "What's included in Free vs Optimizer vs Optimizer Pro?",
    answer:
      'Free Trial scans up to 5 pages and shows your top 3 issues — good for a quick gut-check. Optimizer runs a full site scan with 20+ checks, an exportable PDF report, and a monthly re-scan. Optimizer Pro adds scheduled auto-scans, competitor comparison, white-label PDF reports, and API access.',
  },
  {
    question: 'Do I need to talk to anyone to use this?',
    answer:
      'No. Business Web Optimizer is fully self-serve. Paste your URL, run the scan, and get your results instantly. No calls, no discovery meetings, no back-and-forth.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Paid plans (Optimizer and Optimizer Pro) are month-to-month subscriptions. You can cancel anytime — no lock-ins, no cancellation fees.',
  },
  {
    question: 'How do payments and billing work?',
    answer:
      'Payments are handled securely via Stripe. Optimizer and Optimizer Pro are billed monthly. The Free Trial has no payment required. You\'ll be charged on the same date each month and can cancel anytime from your account.',
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-20 bg-muted/30">
      <div className="bwg-wrap">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="bwg-eyebrow">Questions</div>
          <h2
            className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-12"
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

          {/* Contact line */}
          <p className="mt-10 text-center text-sm text-muted-foreground" data-testid="text-faq-contact">
            Still have questions?{' '}
            <a href="mailto:contact@businessweboptimizer.com" className="text-primary hover:underline font-medium">
              contact@businessweboptimizer.com
            </a>
            {' '}or call{' '}
            <a href="tel:+19844007773" className="text-primary hover:underline font-medium whitespace-nowrap" data-testid="link-phone-faq">
              (984) 400‑7773
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
