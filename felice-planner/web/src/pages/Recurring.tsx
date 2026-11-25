import { CATEGORIES, RECURRING_CATEGORIES, isIgnoredLump } from '../../../shared/categories.ts';
import type { LineItem } from '../../../shared/types.ts';
import { Card, ErrorBanner, Loading } from '../components.tsx';
import { CategorySection, type LineActions } from '../ItemEditor.tsx';
import { money, useAsync } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';
import { ResidentDjSection, djActions } from '../ResidentDjs.tsx';

export function RecurringPage() {
  const { api } = useOrg();
  const actions: LineActions = {
    add: (item) => api.addRecurring(item),
    update: (id, item) => api.updateRecurring(id, item),
    remove: (id) => api.deleteRecurring(id),
  };
  const { data, error, loading, setData, reload } = useAsync(() => api.recurring(), []);
  const items: LineItem[] = data ?? [];
  // A lump-sum Resident DJs line does not count once the list has individual DJs.
  const total = items.filter((i) => !isIgnoredLump(i, items)).reduce((s, i) => s + i.amount + i.riderCost, 0);

  return (
    <>
      <header className="page-header">
        <h1>
          Recurring costs <OrgBadge />
        </h1>
      </header>
      <Card title="How this works">
        <p>
          These costs are added to every new week when you tick "Add the recurring costs" on the Weekly planner. Changing them here
          affects <strong>new weeks only</strong>. Weeks you have already created keep their own figures, which you edit in the week.
        </p>
        <p className="week-total-line">
          Added to each new week: <strong>{money(total)}</strong>
        </p>
      </Card>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data &&
        CATEGORIES.filter((c) => RECURRING_CATEGORIES.includes(c.key)).map((c) =>
          c.key === 'resident' ? (
            <ResidentDjSection
              key={c.key}
              actions={djActions(actions, (dj) => api.addRecurringDj(dj))}
              importList={(file, dryRun) => api.importRecurringDjs(file, dryRun)}
              items={items.filter((i) => i.category === 'resident')}
              onItemsChange={(changed) => setData([...items.filter((i) => i.category !== 'resident'), ...changed])}
              onImported={reload}
            />
          ) : (
            <CategorySection
              key={c.key}
              actions={actions}
              category={c.key}
              label={c.label}
              color={c.color}
              items={items.filter((i) => i.category === c.key)}
              onItemsChange={(changed) => setData([...items.filter((i) => i.category !== c.key), ...changed])}
            />
          ),
        )}
    </>
  );
}
