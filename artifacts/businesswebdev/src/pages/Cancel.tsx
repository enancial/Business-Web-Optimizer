import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';

export function Cancel() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
          No worries at all.
        </h1>

        <p className="text-slate-300 leading-relaxed mb-10">
          Take your time — you can come back whenever you're ready.
        </p>

        <Button
          onClick={() => navigate('/')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Back to homepage
        </Button>
      </div>
    </div>
  );
}
