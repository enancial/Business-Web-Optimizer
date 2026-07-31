export function Footer() {
  return (
    <footer className="bg-[hsl(220,15%,12%)] text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Copyright */}
          <p className="text-sm text-white/70" data-testid="text-copyright">
            © 2026 Business Web Dev. All rights reserved.
          </p>

          {/* Email */}
          <a
            href="mailto:contact@businesswebdev.com"
            className="text-sm text-white/90 hover:text-white transition-colors"
            data-testid="link-email"
          >
            contact@businesswebdev.com
          </a>

          {/* Links */}
          <div className="flex gap-6">
            <a
              href="#launch-package"
              className="text-sm text-white/70 hover:text-white transition-colors"
              data-testid="link-footer-launch-package"
            >
              Launch Package
            </a>
            <a
              href="#management-plan"
              className="text-sm text-white/70 hover:text-white transition-colors"
              data-testid="link-footer-management-plan"
            >
              Management Plan
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
