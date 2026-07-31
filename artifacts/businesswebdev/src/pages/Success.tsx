import { useLocation } from 'wouter';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Success() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-6" />

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Payment received!
        </h1>

        <p className="text-slate-300 leading-relaxed mb-4">
          You're all set. Check your inbox for a payment confirmation, then I'll
          reach out within <strong className="text-white">one business day</strong> with
          your onboarding form and next steps.
        </p>

        <p className="text-slate-400 text-sm mb-10">
          Questions in the meantime?{' '}
          <a
            href="mailto:hello@businesswebdev.com"
            className="text-indigo-400 hover:text-indigo-300 underline transition-colors"
          >
            hello@businesswebdev.com
          </a>
        </p>

        <Button
          onClick={() => navigate('/')}
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          Back to homepage
        </Button>
      </div>
    </div>
  );
}
