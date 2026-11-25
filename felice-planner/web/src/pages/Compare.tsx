import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CATEGORIES, monthKey, weekLabel } from '../../../shared/categories.ts';
import type { CompareMode, CompareReport, CompareSide } from '../../../shared/types.ts';
import { Card, Change, ErrorBanner, Loading, MonthField, Toggle } from '../components.tsx';
import { currentMonthKey, money, money0, moneyCompact, useAsync } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';

const MODES: { value: CompareMode; label: string }[] = [
  { value: 'month', label: 'Month vs month' },
  { value: 'week', label: 'Week vs week' },
];

export function ComparePage() {
  const { api } = useOrg();
  const weeks = useAsync(() => api.weeks(), []);
  const [mode, setMode] = useState<CompareMode>('month');
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const months = useMemo(() => [...new Set((weeks.data ?? []).map((w) => monthKey(w.year, w.month)))], [weeks.data]);

  // Default to the two most recent months (or weeks) that have data.
  useEffect(() => {
    if (!weeks.data) return;
    if (mode === 'month') {
      setA(months.at(-2) ?? months.at(-1) ?? currentMonthKey());
      setB(months.at(-1) ?? currentMonthKey());
    } else {
      setA(String(weeks.data.at(-2)?.id ?? weeks.data.at(-1)?.id ?? ''));
      setB(String(weeks.data.at(-1)?.id ?? ''));
    }
  }, [mode, weeks.data, months]);

  return (
    <>
      <header className="page-header">
        <h1>
          Compare <OrgBadge />
        </h1>
      </header>
      <ErrorBanner message={weeks.error} />
      <div className="toolbar">
        <Toggle label="Comparison type" value={mode} options={MODES} onChange={setMode} />
      </div>
      {weeks.loading && !weeks.data && <Loading />}
      {weeks.data && weeks.data.length === 0 && <p className="muted">There's no data to compare yet.</p>}
      {weeks.data && weeks.data.length > 0 && (
        <>
          <div className="compare-pickers card">
            <Picker label="Compare" mode={mode} value={a} onChange={setA} weeks={weeks.data} />
            <span aria-hidden="true" className="vs">
              vs
            </span>
            <Picker label="With" mode={mode} value={b} onChange={setB} weeks={weeks.data} />
          </div>
          {a && b && <CompareResult mode={mode} a={a} b={b} />}
        </>
      )}
    </>
  );
}

function Picker({
  label,
  mode,
  value,
  onChange,
  weeks,
}: {
  label: string;
  mode: CompareMode;
  value: string;
  onChange: (v: string) => void;
  weeks: { id: number; year: number; month: number; weekNo: number }[];
}) {
  const id = `pick-${label}`;
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {mode === 'month' ? (
        <MonthField id={id} label={label} value={value} onChange={onChange} />
      ) : (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {[...weeks].reverse().map((w) => (
            <option key={w.id} value={w.id}>
              {weekLabel(w.year, w.month, w.weekNo)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CompareResult({ mode, a, b }: { mode: CompareMode; a: string; b: string }) {
  const { api } = useOrg();
  const { data, error, loading } = useAsync(() => api.compare(mode, a, b), [mode, a, b]);
  if (error) return <ErrorBanner message={error} />;
  if (loading && !data) return <Loading />;
  if (!data) return null;
  return <CompareView data={data} />;
}

/** The side-by-side result of any comparison: two weeks, two months, or two organisations. */
export function CompareView({ data }: { data: CompareReport }) {
  const mode = data.mode;
  const { a: A, b: B } = data;
  const chartData = CATEGORIES.map((c) => ({ label: c.label, [A.label]: A.byCategory[c.key], [B.label]: B.byCategory[c.key] }));
  const perWeek = (s: CompareSide) => (s.weeks ? s.total / s.weeks : 0);

  return (
    <>
      <Card title={`${A.label} vs ${B.label}`}>
        <div className="table-scroll">
          <table className="report">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="num">
                  {A.label}
                </th>
                <th scope="col" className="num">
                  {B.label}
                </th>
                <th scope="col" className="num">
                  Difference
                </th>
                <th scope="col" className="num">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c.key}>
                  <th scope="row">{c.label}</th>
                  <td className="num">{money(A.byCategory[c.key])}</td>
                  <td className="num">{money(B.byCategory[c.key])}</td>
                  <td className="num">{money(B.byCategory[c.key] - A.byCategory[c.key])}</td>
                  <td className="num">
                    <Change a={A.byCategory[c.key]} b={B.byCategory[c.key]} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="num">{money(A.total)}</td>
                <td className="num">{money(B.total)}</td>
                <td className="num">{money(B.total - A.total)}</td>
                <td className="num">
                  <Change a={A.total} b={B.total} />
                </td>
              </tr>
              {mode !== 'week' && (
                <>
                  <tr>
                    <th scope="row">Weeks</th>
                    <td className="num">{A.weeks}</td>
                    <td className="num">{B.weeks}</td>
                    <td className="num">{B.weeks - A.weeks}</td>
                    <td />
                  </tr>
                  <tr>
                    <th scope="row">Average per week</th>
                    <td className="num">{money(perWeek(A))}</td>
                    <td className="num">{money(perWeek(B))}</td>
                    <td className="num">{money(perWeek(B) - perWeek(A))}</td>
                    <td className="num">
                      <Change a={perWeek(A)} b={perWeek(B)} />
                    </td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      </Card>

      <Card title="By category">
        <figure aria-label="Grouped bar chart comparing each category. Figures are in the table above.">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
              <Tooltip formatter={(v) => money0(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={A.label} fill="#94a3b8" />
              <Bar dataKey={B.label} fill="#4338ca" />
            </BarChart>
          </ResponsiveContainer>
        </figure>
      </Card>

      <div className="grid-2">
        <Headliners side={A} weekStyle={mode === 'week' ? 'none' : mode === 'month' ? 'short' : 'full'} />
        <Headliners side={B} weekStyle={mode === 'week' ? 'none' : mode === 'month' ? 'short' : 'full'} />
      </div>
    </>
  );
}

/** How each act's week is shown: not at all (single week), "W2" (within a month), or "Nov 2026 W2" (over a period). */
type WeekStyle = 'none' | 'short' | 'full';

function Headliners({ side, weekStyle }: { side: CompareSide; weekStyle: WeekStyle }) {
  const showWeek = weekStyle !== 'none';
  return (
    <Card title={`Headline acts: ${side.label}`}>
      {side.headliners.length === 0 ? (
        <p className="muted">No headline acts.</p>
      ) : (
        <table>
          <thead>
            <tr>
              {showWeek && <th scope="col">Week</th>}
              <th scope="col">Act</th>
              <th scope="col" className="num">
                Rate
              </th>
              <th scope="col" className="num">
                Rider
              </th>
            </tr>
          </thead>
          <tbody>
            {side.headliners.map((h, i) => (
              <tr key={`${h.week}-${h.name}-${i}`}>
                {showWeek && <td>{weekStyle === 'short' ? h.week.split(' ').pop() : h.week}</td>}
                <td>{h.name}</td>
                <td className="num">{money(h.amount)}</td>
                <td className="num">{money(h.riderCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
