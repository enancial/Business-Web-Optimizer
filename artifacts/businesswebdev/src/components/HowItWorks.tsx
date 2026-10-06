import { motion } from 'framer-motion';

const steps = [
  {
    number: '1',
    title: 'Enter your URL.',
    description: 'Provide your website address and, optionally, your email for report delivery. No account needed.',
  },
  {
    number: '2',
    title: 'Choose your plan.',
    description: 'Start free for a quick look, or pick Optimizer or Optimizer Pro for a full audit and ongoing tracking.',
  },
  {
    number: '3',
    title: 'Get your optimization plan.',
    description: 'Receive a prioritized list of fixes and recommendations — clarity, UX, conversions, and SEO all covered.',
  },
  {
    number: '4',
    title: 'Track and improve over time.',
    description: 'Paid plans include recurring scans so you can measure progress and stay ahead of issues as your site evolves.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-background">
      <div className="bwg-wrap">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="bwg-eyebrow">How it works</div>
          <h2
            className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4"
            data-testid="text-how-it-works-headline"
          >
            How it works
          </h2>

          <p className="text-lg text-muted-foreground mb-12 max-w-3xl leading-relaxed">
            Fully self-serve — no calls, no forms, no waiting. Founders in Raleigh, the Triangle area, and across the U.S. use Business Web Optimizer to spot and fix website issues fast.
          </p>

          <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative"
                data-testid={`step-${index + 1}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mt-12 italic">
            Do I need to talk to anyone to use this? No — Business Web Optimizer is fully self-serve.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
