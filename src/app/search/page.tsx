'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { TextInput } from '@/components/ui/Field';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/States';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

interface FamilyResult {
  id: string;
  familyCode: string;
  headOfFamilyName: string;
  phone?: string | null;
}

interface BeneficiaryResult {
  id: string;
  fullName: string;
  phone?: string | null;
  family?: { familyCode: string } | null;
}

interface DonorResult {
  id: string;
  name: string;
  phone?: string | null;
}

interface SearchResults {
  families: FamilyResult[];
  beneficiaries: BeneficiaryResult[];
  donors: DonorResult[];
}

export default function SearchPage() {
  const { can } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  function runSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    apiInvoke<SearchResults>('search:global', { query: trimmed })
      .then((res) => {
        setResults(res);
        setSearched(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  const showFamilies = can('families', 'view');
  const showBeneficiaries = can('beneficiaries', 'view');
  const showDonors = can('donors', 'view');

  const noSectionsVisible = !showFamilies && !showBeneficiaries && !showDonors;
  const noResultsAtAll =
    searched &&
    results !== null &&
    (!showFamilies || results.families.length === 0) &&
    (!showBeneficiaries || results.beneficiaries.length === 0) &&
    (!showDonors || results.donors.length === 0);

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-bold">البحث السريع</h1>

      <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
        <TextInput
          placeholder="ابحث بالاسم، الرمز، رقم الهوية أو الهاتف..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
        />
        <button type="submit" className="btn-primary" disabled={loading || !query.trim()}>
          بحث
        </button>
      </form>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={runSearch} />
      ) : noSectionsVisible ? (
        <EmptyState title="لا توجد صلاحية لعرض نتائج البحث" />
      ) : !searched ? (
        <EmptyState title="ابدأ بكتابة كلمة البحث ثم اضغط بحث" />
      ) : noResultsAtAll ? (
        <EmptyState title="لا توجد نتائج مطابقة" />
      ) : (
        results && (
          <div className="space-y-6">
            {showFamilies && (
              <section>
                <h2 className="mb-2 font-bold">الأسر ({results.families.length})</h2>
                {results.families.length === 0 ? (
                  <p className="text-sm text-gray-500">لا توجد نتائج في الأسر</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {results.families.map((f) => (
                      <div key={f.id} className="card p-3 text-sm">
                        <div className="font-medium">{f.headOfFamilyName}</div>
                        <div className="text-gray-500">الرمز: {f.familyCode}{f.phone ? ` — ${f.phone}` : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {showBeneficiaries && (
              <section>
                <h2 className="mb-2 font-bold">المستفيدون ({results.beneficiaries.length})</h2>
                {results.beneficiaries.length === 0 ? (
                  <p className="text-sm text-gray-500">لا توجد نتائج في المستفيدين</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {results.beneficiaries.map((b) => (
                      <div key={b.id} className="card p-3 text-sm">
                        <div className="font-medium">{b.fullName}</div>
                        <div className="text-gray-500">
                          {b.family?.familyCode ? `رمز الأسرة: ${b.family.familyCode}` : 'بدون أسرة'}
                          {b.phone ? ` — ${b.phone}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {showDonors && (
              <section>
                <h2 className="mb-2 font-bold">المتبرعون ({results.donors.length})</h2>
                {results.donors.length === 0 ? (
                  <p className="text-sm text-gray-500">لا توجد نتائج في المتبرعين</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {results.donors.map((d) => (
                      <div key={d.id} className="card p-3 text-sm">
                        <div className="font-medium">{d.name}</div>
                        <div className="text-gray-500">{d.phone ?? '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )
      )}
    </AppShell>
  );
}
