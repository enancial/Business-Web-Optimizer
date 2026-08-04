import { Button } from '@/components/ui/button';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function BulletItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3 text-gray-700">
      <span className="mt-1.5 h-2 w-2 rounded-full bg-[#1A3A7A] shrink-0" />
      {text}
    </li>
  );
}

function PlanCard({
  name,
  price,
  badge,
  bullets,
  note,
}: {
  name: string;
  price?: string;
  badge?: string;
  bullets: string[];
  note?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="font-bold text-gray-900 text-lg">{name}</h3>
        {badge && (
          <span className="text-xs font-semibold bg-[#1A3A7A]/10 text-[#1A3A7A] px-2.5 py-0.5 rounded-full shrink-0">
            {badge}
          </span>
        )}
      </div>
      {price && <p className="text-2xl font-bold text-[#1A3A7A] mb-4">{price}</p>}
      <ul className="space-y-2 flex-1">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm text-gray-600">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
            {b}
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-4 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
          {note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PartnersPage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      {/* ── Hero ── */}
      <section className="bg-[#1A3A7A] text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block bg-white/10 text-white/90 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
            For Agencies &amp; Partners
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">
            Optimizer for Agencies and Partners
          </h1>
          <p className="text-xl text-white/80 leading-relaxed">
            Use Optimizer internally for client audits, or recommend it to your network and earn recurring revenue.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-16">

        {/* ── Why agencies use Optimizer ── */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Why agencies use Optimizer</h2>
          <ul className="space-y-5">
            {[
              {
                title: 'Audit client sites quickly',
                body: 'Run full scans across performance, SEO, and accessibility, then get a prioritized list of fixes you can act on immediately.',
              },
              {
                title: 'Show clear, measurable value',
                body: 'Use exportable PDF reports (including white‑label reports on Optimizer Pro) to show clients what\'s wrong, what you\'re fixing, and how things improve over time.',
              },
              {
                title: 'Standardize your optimization workflow',
                body: 'Make Optimizer part of your onboarding and ongoing maintenance process: scan at kickoff, re‑scan after changes, and track improvements monthly.',
              },
              {
                title: 'Automate monitoring with scheduled scans',
                body: 'On Optimizer Pro, set up automatic recurring scans so you\'re alerted to new issues before your clients notice.',
              },
            ].map(({ title, body }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#1A3A7A] shrink-0" />
                <div>
                  <span className="font-semibold text-gray-900">{title}: </span>
                  <span className="text-gray-600 leading-relaxed">{body}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Plans ── */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Plans that fit agency workflows</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <PlanCard
              name="Free"
              bullets={[
                'Scan up to 5 pages, see top 3 issues.',
                'Good for quick internal checks or small sites.',
                'No credit card required.',
              ]}
            />
            <PlanCard
              name="Optimizer"
              price="$29/mo"
              note="Includes a 7‑day free trial (no charge today, cancel anytime before day 7)."
              bullets={[
                'Full site scan (no page limit).',
                '20+ checks across performance, SEO, and accessibility.',
                'Prioritized, actionable fix list.',
                'Exportable PDF report.',
                'Monthly re‑scan to track improvements over time.',
              ]}
            />
            <PlanCard
              name="Optimizer Pro"
              price="$79/mo"
              badge="Best for agencies"
              note="Includes a 7‑day free trial (no charge today, cancel anytime before day 7)."
              bullets={[
                'Everything in Optimizer, plus:',
                'Scheduled auto‑scans',
                'Competitor comparison',
                'White‑label PDF reports (your branding, client‑ready)',
                'API access (integrate scans into your own tools/workflows)',
              ]}
            />
          </div>
          <p className="mt-4 text-sm text-gray-500 text-center">
            For agencies, Optimizer Pro is usually the best fit, especially if you manage multiple
            client sites or need white‑label reporting.
          </p>
        </section>

        {/* ── Two ways to work with us ── */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Two ways to work with us</h2>

          {/* Option 1 */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">1. Use Optimizer internally</h3>
            <ul className="space-y-2.5 mb-6">
              {[
                'Sign up for an Optimizer or Optimizer Pro account.',
                'Start a 7‑day free trial to test the full feature set.',
                'Use scans and reports to inform your proposals and roadmaps, demonstrate before/after improvements to clients, and keep sites healthy with ongoing monitoring.',
              ].map((item) => (
                <BulletItem key={item} text={item} />
              ))}
            </ul>
            <Button asChild className="bg-[#1A3A7A] hover:bg-[#1565D6] text-white h-10 px-6">
              <a href="/">Start your 7‑day free trial →</a>
            </Button>
          </div>

          {/* Option 2 */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">2. Recommend Optimizer and earn commissions</h3>
            <div className="text-gray-600 leading-relaxed mb-4 space-y-3">
              <p>
                If you refer clients or peers to Optimizer, you can earn 30% recurring commissions for
                every subscriber you refer — for their first 12 months.
              </p>
              <p className="font-medium text-gray-800">Share your unique referral link with:</p>
              <ul className="space-y-2 ml-1">
                {[
                  'Existing clients who need ongoing optimization.',
                  'Prospects who aren\'t a fit for your services but still need tooling.',
                  'Your audience via content, newsletters, or social posts.',
                ].map((item) => (
                  <BulletItem key={item} text={item} />
                ))}
              </ul>
              <p className="font-medium text-gray-800 mt-3">Affiliates get:</p>
              <ul className="space-y-2 ml-1">
                {[
                  'Unique referral links for Optimizer and Optimizer Pro.',
                  'A live dashboard with stats and earnings.',
                  'Monthly payouts via PayPal or bank transfer (minimum $50).',
                ].map((item) => (
                  <BulletItem key={item} text={item} />
                ))}
              </ul>
            </div>
            <Button asChild variant="outline" className="border-[#1A3A7A] text-[#1A3A7A] hover:bg-[#1A3A7A]/5 h-10 px-6">
              <a href="/affiliates/join">Become an affiliate →</a>
            </Button>
          </div>
        </section>

        {/* ── How agencies typically use Optimizer ── */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">How agencies typically use Optimizer</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                title: 'Pre‑sales & proposals',
                body: 'Run a quick scan on a prospect\'s site to highlight concrete issues you can solve. Use the PDF report as part of your proposal.',
              },
              {
                title: 'Onboarding & audits',
                body: 'Run a full scan at project start. Prioritize fixes with your client and build a roadmap around them.',
              },
              {
                title: 'Ongoing monitoring',
                body: 'Use scheduled scans (Optimizer Pro) to catch new issues early and show continuous improvement in monthly reports.',
              },
              {
                title: 'White‑label client reporting',
                body: 'On Optimizer Pro, generate branded PDFs that look like they came directly from your agency.',
              },
            ].map(({ title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Contact ── */}
        <section className="text-center bg-[#1A3A7A]/5 border border-[#1A3A7A]/10 rounded-2xl py-12 px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Want to discuss agency use cases or volume?</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            If you're managing many client sites or want to explore deeper integration (e.g., API
            workflows, custom reporting), we're happy to talk.
          </p>
          <Button asChild className="bg-[#1A3A7A] hover:bg-[#1565D6] text-white h-11 px-8 text-base">
            <a href="mailto:support@businessweboptimizer.com">Contact us →</a>
          </Button>
        </section>

      </div>

      <Footer />
    </div>
  );
}
