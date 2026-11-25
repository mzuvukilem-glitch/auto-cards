import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupChart, GroupTable, NoActuals, OrgChart, OrgTable, PeriodChart, PeriodTable, PlanVsActualCard, Var, VarianceKpis, VarianceNotes, gap } from '../src/variance.tsx';
import { planActual, varianceByGroup, varianceReport, varianceRow, varianceTotals } from './fixtures.ts';
import { ORGS, renderPage, txt, zar, zar0 } from './helpers.tsx';

const chartData = (testId = 'bar-chart') => JSON.parse(screen.getByTestId(testId).getAttribute('data-chart')!) as Record<string, unknown>[];

describe('gap', () => {
  it('is actual minus planned, rounded to cents', () => {
    expect(gap({ planned: 100, actual: 130.456 })).toBe(30.46);
    expect(gap({ planned: 100, actual: 60 })).toBe(-40);
    expect(gap({ planned: 0.1 + 0.2, actual: 0.3 })).toBeCloseTo(0, 5);
  });
});

describe('Var', () => {
  it('says "on plan" when actual equals planned', () => {
    render(<Var planned={500} actual={500} />);
    expect(screen.getByText('on plan').className).toBe('muted');
  });
  it('treats less than half a cent as on plan', () => {
    render(<Var planned={500} actual={500.004} />);
    expect(screen.getByText('on plan')).toBeTruthy();
  });
  it('shows an overspend with an up arrow, a plus sign and the percentage over plan', () => {
    const { container } = render(<Var planned={1000} actual={1250} />);
    const cell = container.firstElementChild as HTMLElement;
    expect(cell.className).toBe('varcell up');
    expect(txt(cell)).toContain('▲');
    expect(txt(cell)).toContain(`+${zar(250)}`);
    expect(within(cell).getByText('25.0% over plan')).toBeTruthy();
  });
  it('shows an underspend with a down arrow and the percentage under plan', () => {
    const { container } = render(<Var planned={1000} actual={900} />);
    const cell = container.firstElementChild as HTMLElement;
    expect(cell.className).toBe('varcell down');
    expect(txt(cell)).toContain('▼');
    expect(txt(cell)).not.toContain('+');
    expect(within(cell).getByText('10.0% under plan')).toBeTruthy();
  });
  it('says nothing was planned when there is no plan to take a percentage of', () => {
    render(<Var planned={0} actual={300} />);
    expect(screen.getByText('over plan (nothing planned)')).toBeTruthy();
  });
  it('says under plan (nothing planned) for a negative actual with no plan', () => {
    render(<Var planned={0} actual={-300} />);
    expect(screen.getByText('under plan (nothing planned)')).toBeTruthy();
  });
});

describe('VarianceKpis', () => {
  it('shows planned, actual and paid/outstanding', () => {
    render(<VarianceKpis totals={varianceTotals({ planned: 10000, plannedAll: 25000, actual: 12000, paid: 4500, weeksCompared: 3 })} />);
    expect(screen.getByText(zar0(10000))).toBeTruthy();
    expect(screen.getByText(`3 weeks compared. The whole plan for the period is ${zar0(25000)}.`)).toBeTruthy();
    expect(screen.getByText(zar0(12000))).toBeTruthy();
    expect(screen.getByText(`${zar0(4500)} paid, ${zar0(7500)} outstanding`)).toBeTruthy();
  });
  it('words an overspend as over plan with the percentage, and marks it as over', () => {
    const { container } = render(<VarianceKpis totals={varianceTotals({ planned: 10000, actual: 12500, weeksCompared: 1 })} />);
    expect(screen.getByText(`1 week compared. The whole plan for the period is ${zar0(0)}.`)).toBeTruthy();
    expect(screen.getByText(`+${zar(2500)}`)).toBeTruthy();
    expect(screen.getByText('25.0% over plan')).toBeTruthy();
    expect(container.querySelector('.kpi.over')).not.toBeNull();
  });
  it('words an underspend as under plan and marks it as under', () => {
    const { container } = render(<VarianceKpis totals={varianceTotals({ planned: 10000, actual: 9000 })} />);
    expect(screen.getByText(zar(-1000))).toBeTruthy();
    expect(screen.getByText('10.0% under plan')).toBeTruthy();
    expect(container.querySelector('.kpi.under')).not.toBeNull();
  });
  it('reads "On plan" with no hint or tone when the totals match', () => {
    const { container } = render(<VarianceKpis totals={varianceTotals({ planned: 5000, actual: 5000 })} />);
    expect(screen.getByText('On plan')).toBeTruthy();
    expect(container.querySelectorAll('.kpi.over, .kpi.under')).toHaveLength(0);
    const variance = screen.getByText('Variance (actual minus planned)').parentElement!;
    expect(variance.querySelector('.kpi-hint')).toBeNull();
  });
  it('falls back to plain wording when nothing was planned', () => {
    render(<VarianceKpis totals={varianceTotals({ planned: 0, actual: 800 })} />);
    expect(screen.getByText('over plan')).toBeTruthy();
  });
});

describe('VarianceNotes', () => {
  it('explains what is compared and stays quiet about unplanned weeks when there are none', () => {
    render(<VarianceNotes totals={varianceTotals({ weeksUnplanned: 0 })} />);
    const text = document.body.textContent!;
    expect(text).toContain('Only weeks that have actual expenditure are compared');
    expect(text).toContain('a positive figure is an overspend');
    expect(text).not.toContain('no plan');
  });
  it('says one compared week has no plan', () => {
    render(<VarianceNotes totals={varianceTotals({ weeksUnplanned: 1 })} />);
    expect(txt(document.body)).toContain('1 compared week has no plan, so its plan counts as R0.');
  });
  it('says several compared weeks have no plan', () => {
    render(<VarianceNotes totals={varianceTotals({ weeksUnplanned: 3 })} />);
    expect(txt(document.body)).toContain('3 compared weeks have no plan, so their plan counts as R0.');
  });
});

describe('charts', () => {
  it('PeriodChart plots only the periods that were compared', () => {
    render(
      <PeriodChart
        rows={[
          varianceRow({ key: '2026-04', label: 'Apr 2026', weeksCompared: 0, planned: 900, actual: 0 }),
          varianceRow({ key: '2026-05', label: 'May 2026', weeksCompared: 2, planned: 1000, actual: 1200 }),
        ]}
      />,
    );
    expect(screen.getByRole('figure').getAttribute('aria-label')).toContain('planned and actual spend for each period');
    expect(chartData()).toEqual([{ label: 'May 2026', Planned: 1000, Actual: 1200 }]);
    expect(screen.getAllByTestId('series').map((s) => s.getAttribute('data-key'))).toEqual(['Planned', 'Actual']);
  });
  it('PeriodChart shows nothing when no period was compared', () => {
    const { container } = render(<PeriodChart rows={[varianceRow({ key: 'a', label: 'A', weeksCompared: 0 })]} />);
    expect(container.firstChild).toBeNull();
  });
  it('GroupChart plots every cost group', () => {
    render(<GroupChart totals={varianceTotals({ byGroup: varianceByGroup({ headline: planActual(100, 150), marketing: planActual(10, 5) }) })} />);
    const data = chartData();
    expect(data.map((d) => d.label)).toEqual(['Headline Acts', 'Resident DJs', 'Hosts & Promoters', 'Rider Costs', 'Standard Costs', 'Marketing & other']);
    expect(data[0]).toEqual({ label: 'Headline Acts', Planned: 100, Actual: 150 });
    expect(data[5]).toEqual({ label: 'Marketing & other', Planned: 10, Actual: 5 });
  });
  it('formats axis ticks and tooltips in rand', () => {
    render(<GroupChart totals={varianceTotals()} />);
    expect(txt(screen.getByTestId('y-tick'))).toMatch(/^R1[.,]5/);
    expect(txt(screen.getByTestId('tooltip-sample'))).toBe(zar0(1234.4));
  });
  it('OrgChart plots each organisation, with zero for one that has no figures', () => {
    render(<OrgChart orgs={ORGS} totals={varianceTotals({ byOrg: { felice: planActual(500, 700) } })} />);
    expect(chartData()).toEqual([
      { label: 'Felice', Planned: 500, Actual: 700 },
      { label: 'Alur', Planned: 0, Actual: 0 },
    ]);
  });
});

describe('GroupTable', () => {
  const totals = varianceTotals({
    planned: 1500,
    actual: 1450,
    byGroup: varianceByGroup({ headline: planActual(1000, 1200), resident: planActual(500, 250), rider: planActual(0, 0) }),
  });
  it('lists each group with planned, actual and variance wording', () => {
    render(<GroupTable totals={totals} />);
    expect(screen.getByRole('table', { name: 'Planned and actual spend by cost group' })).toBeTruthy();
    const headline = screen.getByRole('row', { name: /Headline Acts/ });
    expect(txt(headline)).toContain(zar(1000));
    expect(txt(headline)).toContain(zar(1200));
    expect(txt(headline)).toContain('20.0% over plan');
    expect(txt(screen.getByRole('row', { name: /Resident DJs/ }))).toContain('50.0% under plan');
  });
  it('shows a dash for a group with nothing planned or spent', () => {
    render(<GroupTable totals={totals} />);
    const cells = within(screen.getByRole('row', { name: /Rider Costs/ })).getAllByRole('cell');
    expect(cells[2]!.textContent).toBe('–');
  });
  it('totals the table', () => {
    render(<GroupTable totals={totals} />);
    const total = screen.getByRole('row', { name: /^Total/ });
    expect(txt(total)).toContain(zar(1500));
    expect(txt(total)).toContain(zar(1450));
    expect(txt(total)).toContain('3.3% under plan');
  });
});

describe('PeriodTable', () => {
  it('says so when the period has no rows', () => {
    render(<PeriodTable rows={[]} label="Month" />);
    expect(screen.getByText('Nothing in this period.')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Planned and actual spend by month' })).toBeTruthy();
  });
  it('shows compared periods with variance and the whole plan for context', () => {
    render(<PeriodTable label="Week" rows={[varianceRow({ key: 'w1', label: 'May 2026 W1', weeksCompared: 1, planned: 1000, actual: 1100, plannedAll: 1000 })]} />);
    const row = screen.getByRole('row', { name: /May 2026 W1/ });
    expect(row.className).toBe('');
    expect(txt(row)).toContain(zar(1000));
    expect(txt(row)).toContain(zar(1100));
    expect(txt(row)).toContain('10.0% over plan');
    expect(screen.getByRole('columnheader', { name: 'Week' })).toBeTruthy();
  });
  it('marks a period with a plan but no actuals yet', () => {
    render(<PeriodTable label="Month" rows={[varianceRow({ key: 'm', label: 'Jul 2026', weeksCompared: 0, planned: 0, actual: 0, plannedAll: 4000 })]} />);
    const row = screen.getByRole('row', { name: /Jul 2026/ });
    expect(row.className).toBe('');
    expect(txt(row)).toContain('no actuals yet');
    expect(txt(row)).toContain(zar(4000));
  });
  it('greys out a period with neither plan nor actuals', () => {
    render(<PeriodTable label="Month" rows={[varianceRow({ key: 'm', label: 'Aug 2026', weeksCompared: 0, plannedAll: 0 })]} />);
    const row = screen.getByRole('row', { name: /Aug 2026/ });
    expect(row.className).toBe('empty-row');
    expect(within(row).getAllByText('–').length).toBeGreaterThanOrEqual(3);
  });
  it('shows a dash for the whole plan when a compared period had none', () => {
    render(<PeriodTable label="Month" rows={[varianceRow({ key: 'm', label: 'Sep 2026', weeksCompared: 1, planned: 0, actual: 200, plannedAll: 0 })]} />);
    const row = screen.getByRole('row', { name: /Sep 2026/ });
    expect(row.className).toBe('');
    expect(txt(row)).toContain('over plan (nothing planned)');
    expect(within(row).getAllByRole('cell').at(-1)!.textContent).toBe('–');
  });
});

describe('OrgTable', () => {
  it('shows each organisation, and "no actuals yet" for one without figures', () => {
    render(<OrgTable orgs={ORGS} totals={varianceTotals({ planned: 1000, actual: 800, byOrg: { felice: planActual(1000, 800) } })} />);
    const felice = screen.getByRole('row', { name: /Felice/ });
    expect(txt(felice)).toContain(zar(1000));
    expect(txt(felice)).toContain('20.0% under plan');
    expect(screen.getByRole('row', { name: /Alur/ }).textContent).toContain('no actuals yet');
    expect(txt(screen.getByRole('row', { name: /Combined/ }))).toContain(zar(800));
  });
  it('treats an organisation with only actual spend as having figures', () => {
    render(<OrgTable orgs={ORGS} totals={varianceTotals({ byOrg: { alur: planActual(0, 90) } })} />);
    expect(screen.getByRole('row', { name: /Alur/ }).textContent).toContain('over plan (nothing planned)');
  });
  it('treats an organisation with a plan but nothing spent as having figures', () => {
    render(<OrgTable orgs={ORGS} totals={varianceTotals({ byOrg: { alur: planActual(90, 0) } })} />);
    expect(screen.getByRole('row', { name: /Alur/ }).textContent).toContain('100.0% under plan');
  });
  it('shows "no actuals yet" for an organisation whose figures are all zero', () => {
    render(<OrgTable orgs={ORGS} totals={varianceTotals({ byOrg: { alur: planActual(0, 0) } })} />);
    expect(screen.getByRole('row', { name: /Alur/ }).textContent).toContain('no actuals yet');
  });
});

describe('NoActuals', () => {
  it('explains that nothing has been imported', () => {
    render(<NoActuals>Nothing yet</NoActuals>);
    const region = screen.getByRole('region', { name: 'No actual expenditure in this period' });
    expect(within(region).getByText('Nothing yet')).toBeTruthy();
  });
});

describe('PlanVsActualCard', () => {
  it('tells you how to start when nothing was compared, with one link per import place', () => {
    const report = varianceReport({ totals: varianceTotals({ weeksCompared: 0 }) });
    renderPage(
      <PlanVsActualCard
        report={report}
        reportPath="/master/actuals"
        importLinks={[
          { to: '/o/felice/data', label: 'Felice' },
          { to: '/o/alur/data', label: 'Alur' },
        ]}
      />,
    );
    const card = screen.getByRole('region', { name: 'Plan vs actual' });
    expect(within(card).getByText(/No actual expenditure has been imported for this period yet/)).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Felice' }).getAttribute('href')).toBe('/o/felice/data');
    expect(within(card).getByRole('link', { name: 'Alur' }).getAttribute('href')).toBe('/o/alur/data');
    expect(within(card).getByRole('link', { name: 'Full report' }).getAttribute('href')).toBe('/master/actuals');
    expect(within(card).queryByTestId('bar-chart')).toBeNull();
  });
  it('shows the figures and chart for one organisation', () => {
    const report = varianceReport({
      rows: [varianceRow({ key: '2026-05', label: 'May 2026', weeksCompared: 1, planned: 1000, actual: 1100 })],
      totals: varianceTotals({ weeksCompared: 1, planned: 1000, actual: 1100 }),
    });
    renderPage(<PlanVsActualCard report={report} reportPath="/o/felice/actuals" importLinks={[{ to: '/o/felice/data', label: 'Import' }]} />);
    expect(screen.getByText('Variance (actual minus planned)')).toBeTruthy();
    expect(chartData()).toEqual([{ label: 'May 2026', Planned: 1000, Actual: 1100 }]);
    expect(screen.queryByRole('table', { name: /by organisation/ })).toBeNull();
  });
  it('adds the per-organisation table in the combined view', () => {
    const report = varianceReport({
      rows: [varianceRow({ key: '2026-05', label: 'May 2026', weeksCompared: 1, planned: 1000, actual: 1100 })],
      totals: varianceTotals({ weeksCompared: 1, planned: 1000, actual: 1100, byOrg: { felice: planActual(1000, 1100) } }),
    });
    renderPage(<PlanVsActualCard report={report} reportPath="/master/actuals" importLinks={[]} orgs={ORGS} />);
    expect(screen.getByRole('table', { name: 'Planned and actual spend by organisation' })).toBeTruthy();
  });
});
