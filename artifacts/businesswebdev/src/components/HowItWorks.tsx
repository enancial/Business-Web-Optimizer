import { motion } from 'framer-motion';

const steps = [
  {
    number: '1',
    title: 'Choose your package and pay online.',
    description: 'No calls, no discovery meeting. Just read the offer, decide, and checkout.',
  },
  {
    number: '2',
    title: 'Fill out a short onboarding form (no calls).',
    description: 'Share your goals, site access, and assets. Everything I need in one place.',
  },
  {
    number: '3',
    title: 'I do the work and send clear video updates.',
    description: 'All communication is async via email and short Loom videos.',
  },
  {
    number: '4',
    title: 'You get a launch-ready site or ongoing management, with minimal back-and-forth.',
    description: 'Focused work, clear outcomes, no endless meetings.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="text-3xl sm:text-4xl font-bold mb-4 text-center"
            data-testid="text-how-it-works-headline"
          >
            How it works
          </h2>

          <p className="text-lg text-muted-foreground mb-12 text-center max-w-3xl mx-auto leading-relaxed">
            Designed to be fast, focused, and almost entirely contactless. Whether you're starting with the 30-Day Launch Package or jumping straight into the Website Management Plan, the process is the same: choose your plan, pay online, fill out a short form, and I handle the rest.
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

          <p className="text-sm text-muted-foreground text-center mt-12 italic">
            Calls are not required. If you prefer, we can add a short intro call as an exception.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
