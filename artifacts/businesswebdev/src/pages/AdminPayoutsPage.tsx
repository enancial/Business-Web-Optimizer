import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, CheckCircle2, Loader2 } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface PayoutRow {
  affiliateId: number;
  affiliateName: string;
  affiliateEmail: string;
  paypalEmail: string | null;
  totalCommissionCents: number;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function AdminPayoutsPage() {
  const [month, setMonth] = useState(currentYearMonth());
  const [adminSecret, setAdminSecret] = useState('');
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markSuccess, setMarkSuccess] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [markLoading, setMarkLoading] = useState(false);

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setRows(null);
    setSelectedIds(new Set());
    setMarkSuccess(null);
    try {
      const res = await fetch(
        `${BASE}/api/admin/affiliate-payouts-preview?month=${encodeURIComponent(month)}`,
        { headers: { Authorization: `Bearer ${adminSecret}` } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setRows(data.rows as PayoutRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadCsv() {
    const url = `${BASE}/api/admin/affiliate-payouts?month=${encodeURIComponent(month)}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminSecret}` },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `affiliate-payouts-${month}.csv`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    }
  }

  async function handleMarkPaid() {
    if (selectedIds.size === 0) return;
    setMarkLoading(true);
    setMarkSuccess(null);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/affiliate-mark-paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSecret}`,
        },
        body: JSON.stringify({ affiliateIds: [...selectedIds], month }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setMarkSuccess(`Marked ${data.updated} earning row(s) as paid for ${month}.`);
      setSelectedIds(new Set());
      // Refresh preview
      await handlePreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mark-paid failed.');
    } finally {
      setMarkLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 sm:px-6 py-4 flex items-center gap-3">
        <a href="/" className="font-bold text-primary text-lg">Business Web Optimizer</a>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Admin — Affiliate Payouts</span>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Controls */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-6">
          <h1 className="font-semibold text-lg mb-4">Affiliate Payout Report</h1>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="space-y-1">
              <Label htmlFor="month-input">Month (YYYY-MM)</Label>
              <Input
                id="month-input"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="admin-secret">Admin secret</Label>
              <Input
                id="admin-secret"
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="ADMIN_SECRET value"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handlePreview}
              disabled={loading || !adminSecret}
              className="bg-[var(--bwg-navy)] hover:bg-primary text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Preview payouts
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadCsv}
              disabled={!adminSecret}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>

        {/* Errors */}
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Mark-paid success */}
        {markSuccess && (
          <div className="mb-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {markSuccess}
          </div>
        )}

        {/* Results table */}
        {rows !== null && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">
                {rows.length === 0
                  ? 'No payouts above $50 threshold'
                  : `${rows.length} affiliate(s) to pay — ${month}`}
              </h2>
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  onClick={handleMarkPaid}
                  disabled={markLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {markLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Mark {selectedIds.size} as paid
                </Button>
              )}
            </div>

            {rows.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedIds.size === rows.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(rows.map((r) => r.affiliateId)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">PayPal</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.affiliateId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.has(row.affiliateId)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(row.affiliateId);
                            else next.delete(row.affiliateId);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{row.affiliateName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.affiliateEmail}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.paypalEmail ?? <span className="text-amber-500 text-xs">Not set</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-primary">
                        {formatCents(row.totalCommissionCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={4} className="px-4 py-3 font-semibold text-right text-muted-foreground">
                      Total payout
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary">
                      {formatCents(rows.reduce((s, r) => s + r.totalCommissionCents, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {rows.length === 0 && (
              <div className="px-6 py-10 text-center text-muted-foreground text-sm">
                No affiliates have earned ≥ $50 in unpaid commissions for {month}.
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground text-center">
          After paying affiliates manually, use the checkboxes above to mark their earnings as paid.
          <br />
          The minimum payout threshold is <strong>$50</strong>. Commission is 30% of each invoice for the first 12 months.
        </p>
      </div>
    </div>
  );
}
