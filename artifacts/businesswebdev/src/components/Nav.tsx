import { useState, useEffect } from 'react';
import { Menu, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCAN_TOKEN_KEY } from '@/hooks/useAccountToken';

export function Nav() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasPaidToken, setHasPaidToken] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(SCAN_TOKEN_KEY);
    if (!raw) return;
    try {
      const parts = raw.split('.');
      const p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { tier?: string; exp?: number };
      setHasPaidToken(p.tier === 'paid' && typeof p.exp === 'number');
    } catch { /* ignore */ }
  }, []);

  const navLinks = [
    { label: 'Pricing',     href: '#pricing' },
    { label: 'Run a Scan',  href: '#optimizer-tool' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'FAQ',          href: '#faq' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* ── Brand mark: icon + text ── */}
          <a
            href="#top"
            className="flex items-center gap-3 flex-shrink-0 hover:opacity-80 transition-opacity"
            data-testid="link-logo"
            aria-label="Business Web Optimizer — home"
          >
            <img
              src="/images/branding/icon.png"
              alt=""
              aria-hidden="true"
              className="h-9 w-auto"
            />
            <span className="font-bold text-[#1A3A7A] leading-tight text-base sm:text-lg">
              Business Web Optimizer
            </span>
          </a>

          {/* ── Desktop nav links ── */}
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-[#1A3A7A] transition-colors"
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* ── Desktop phone + CTA ── */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="tel:+19844007773"
              className="text-sm text-gray-500 hover:text-[#1A3A7A] transition-colors whitespace-nowrap"
              data-testid="link-phone-header"
            >
              (984) 400‑7773
            </a>
            {hasPaidToken && (
              <a
                href="/account"
                className="text-sm font-medium text-[#1A3A7A] hover:text-[#1565D6] transition-colors flex items-center gap-1.5"
                data-testid="link-my-account-desktop"
              >
                <User className="h-3.5 w-3.5" />
                My Account
              </a>
            )}
            <Button asChild size="sm" className="bg-[#1A3A7A] hover:bg-[#1E45A0] text-white" data-testid="button-try-free-desktop">
              <a href="#optimizer-tool">Try Free</a>
            </Button>
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            data-testid="button-mobile-menu"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-5 w-5 text-gray-700" /> : <Menu className="h-5 w-5 text-gray-700" />}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown ── */}
      {isOpen && (
        <div
          className="md:hidden border-t border-gray-100 bg-white shadow-lg"
          data-testid="mobile-menu"
        >
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#1A3A7A] transition-colors"
                data-testid={`link-mobile-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 space-y-2">
              {hasPaidToken && (
                <a
                  href="/account"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-[#1A3A7A] hover:bg-gray-50 transition-colors"
                  data-testid="link-my-account-mobile"
                >
                  <User className="h-4 w-4" />
                  My Account
                </a>
              )}
              <Button asChild className="w-full bg-[#1A3A7A] hover:bg-[#1E45A0] text-white" data-testid="button-try-free-mobile">
                <a href="#optimizer-tool" onClick={() => setIsOpen(false)}>Try Free</a>
              </Button>
              <a
                href="tel:+19844007773"
                className="flex justify-center text-sm text-gray-500 hover:text-[#1A3A7A] transition-colors py-1"
                data-testid="link-phone-mobile"
              >
                (984) 400‑7773
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
