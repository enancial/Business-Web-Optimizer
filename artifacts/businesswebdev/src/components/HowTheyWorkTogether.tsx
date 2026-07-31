import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const paths = [
  'New or overhauled site first: Start with the 30-Day Launch Package to get your foundation right, then add the Website Management Plan to keep improving and maintaining the site.',
  'Existing site, need management: If your site is already solid, you can start directly with the Website Management Plan.',
  'Both from the start: Some clients choose to do the 30-Day Launch Package and the Website Management Plan together, so the site is built with ongoing management in mind from day one.',
];

export function HowTheyWorkTogether() {
  return (
    <section id="how-they-work-together" className="py-20 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="text-3xl sm:text-4xl font-bold mb-4"
            data-testid="text-how-they-work-together-headline"
          >
            How the 30-Day Launch Package and Website Management Plan work together
          </h2>

          <p className="text-lg text-muted-foreground mb-8">
            Most clients follow one of these paths:
          </p>

          <div className="space-y-6 mb-8">
            {paths.map((path, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex items-start gap-4 bg-card border border-border rounded-lg p-6"
                data-testid={`path-${index}`}
              >
                <ArrowRight className="h-6 w-6 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-foreground leading-relaxed">{path}</p>
              </motion.div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground italic">
            The Website Management Plan is always a separate, ongoing engagement at $450/month. There's no discount for doing both; it's simply the right sequence for different situations.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
