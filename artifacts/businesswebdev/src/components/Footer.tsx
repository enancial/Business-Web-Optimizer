export function Footer() {
  return (
    <footer className="bg-[hsl(220,15%,12%)] text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Brand mark */}
        <div className="flex justify-center mb-3">
          <a
            href="#top"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            aria-label="Business Web Optimizer — home"
          >
            <img
              src="/images/branding/icon-dark.png"
              alt=""
              aria-hidden="true"
              style={{ height: 40, width: 'auto' }}
            />
            <span className="font-bold text-white text-lg">Business Web Optimizer</span>
          </a>
        </div>

        {/* Legal name + location */}
        <p className="text-center text-xs text-white/40 mb-8">
          Business Web Development &amp; Consulting · Part of Business Web Group · Raleigh, NC
        </p>

        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Copyright */}
          <p className="text-sm text-white/60" data-testid="text-copyright">
            © 2026 Business Web Development &amp; Consulting. All rights reserved.
          </p>

          {/* Contact */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <a
              href="mailto:contact@businessweboptimizer.com"
              className="text-sm text-white/80 hover:text-white transition-colors"
              data-testid="link-email"
            >
              contact@businessweboptimizer.com
            </a>
            <span className="hidden sm:block text-white/30">·</span>
            <a
              href="tel:+19844007773"
              className="text-sm text-white/80 hover:text-white transition-colors whitespace-nowrap"
              data-testid="link-phone-footer"
            >
              (984) 400‑7773
            </a>
            <span className="hidden sm:block text-white/30">·</span>
            <span className="text-sm text-white/50">Raleigh, NC</span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <a
              href="#pricing"
              className="text-sm text-white/60 hover:text-white transition-colors"
              data-testid="link-footer-pricing"
            >
              Pricing
            </a>
            <a
              href="#optimizer-tool"
              className="text-sm text-white/60 hover:text-white transition-colors"
              data-testid="link-footer-optimizer-tool"
            >
              Run a Scan
            </a>
            <a
              href="/affiliates"
              className="text-sm text-white/60 hover:text-white transition-colors"
              data-testid="link-footer-affiliates"
            >
              Affiliates
            </a>
            <a
              href="/partners"
              className="text-sm text-white/60 hover:text-white transition-colors"
              data-testid="link-footer-partners"
            >
              Partners
            </a>
            <a
              href="#faq"
              className="text-sm text-white/60 hover:text-white transition-colors"
              data-testid="link-footer-faq"
            >
              FAQ
            </a>
            <a
              href="/account"
              className="text-sm text-white/60 hover:text-white transition-colors"
              data-testid="link-footer-account"
            >
              My Account
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
