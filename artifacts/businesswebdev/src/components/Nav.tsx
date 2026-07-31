import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/BrandLogo';

export function Nav() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Launch Package', href: '#launch-package' },
    { label: 'Management Plan', href: '#management-plan' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'FAQ', href: '#faq' },
  ];

  const handleLinkClick = () => {
    setIsOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        isScrolled ? 'bg-card/95 backdrop-blur-sm border-b shadow-sm' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a
            href="#top"
            className="flex items-center hover:opacity-90 transition-opacity"
            data-testid="link-logo"
            aria-label="Business Web Dev — home"
          >
            <BrandLogo variant="default" height={36} />
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* CTA Button Desktop */}
          <div className="hidden md:block">
            <Button asChild size="sm" data-testid="button-work-with-me-desktop">
              <a href="#launch-package">Work With Me</a>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-mobile-menu"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden border-t bg-card" data-testid="mobile-menu">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleLinkClick}
                className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`link-mobile-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {link.label}
              </a>
            ))}
            <Button asChild className="w-full" data-testid="button-work-with-me-mobile">
              <a href="#launch-package" onClick={handleLinkClick}>
                Work With Me
              </a>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
