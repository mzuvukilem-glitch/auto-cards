import type { CategoryKey } from '../../shared/categories.ts';
import type {
  ActualImportPreview,
  ActualSheetList,
  ActualWeekDetail,
  ActualWeekSummary,
  VarianceReport,
  CompareMode,
  CompareReport,
  DjImportResult,
  GroupBy,
  ImportResult,
  Item,
  LineItem,
  Organisation,
  PaymentSchedule,
  ResidentBookingsReport,
  RiderCalc,
  RiderPrice,
  RiderPriceImportResult,
  SummaryReport,
  TopEntry,
  WeekDetail,
  WeekSummary,
} from '../../shared/types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Called whenever the session has expired, so the app can show the sign-in screen. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'felice' };
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    payload = body;
    headers['Content-Type'] = 'application/octet-stream';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;

  if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | undefined)?.error ?? `Request failed (${res.status})`);
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();

/** Which tab of the expense workbook, and which week it is the actuals for. */
export interface ActualImportParams {
  sheet: string;
  year: number;
  month: number;
  weekNo: number;
  /** Section totals changed from the sheet's figure, in rand, keyed by section heading. */
  adjust?: Record<string, number>;
}

/** One item asked for on a rider: its name, the cost of one (rand) and how many. */
export interface RiderLineInput {
  name: string;
  unitCost: number;
  quantity: number;
}
export interface RiderPriceInput {
  name: string;
  cost: number;
}
export interface ItemInput {
  category: CategoryKey;
  name: string;
  /** Rate for headline acts and hosts; cost for every other category. */
  amount: number;
  /** Required for headline acts and hosts. */
  riderCost?: number;
  notes: string;
}

/** One resident DJ and their rate. */
export interface DjInput {
  name: string;
  rate: number;
  notes: string;
}

/** Everything one organisation can do. */
function orgApi(slug: string) {
  const base = `/orgs/${encodeURIComponent(slug)}`;
  return {
    weeks: () => request<WeekSummary[]>('GET', `${base}/weeks`),
    week: (id: number) => request<WeekDetail>('GET', `${base}/weeks/${id}`),
    createWeek: (input: { year: number; month: number; weekNo: number; copyRecurring: boolean }) =>
      request<WeekDetail>('POST', `${base}/weeks`, input),
    updateWeekNotes: (id: number, notes: string) => request<WeekDetail>('PATCH', `${base}/weeks/${id}`, { notes }),
    deleteWeek: (id: number) => request<void>('DELETE', `${base}/weeks/${id}`),

    addItem: (weekId: number, item: ItemInput) => request<Item>('POST', `${base}/weeks/${weekId}/items`, item),
    updateItem: (id: number, item: ItemInput) => request<Item>('PUT', `${base}/items/${id}`, item),
    deleteItem: (id: number) => request<void>('DELETE', `${base}/items/${id}`),

    itemRider: (id: number) => request<RiderCalc>('GET', `${base}/items/${id}/rider`),
    saveRider: (id: number, lines: RiderLineInput[]) => request<{ item: Item; rider: RiderCalc }>('PUT', `${base}/items/${id}/rider`, { lines }),
    copyRider: (fromId: number, toItemIds: number[]) => request<Item[]>('POST', `${base}/items/${fromId}/rider/copy`, { toItemIds }),
    riderPrices: () => request<RiderPrice[]>('GET', `${base}/rider-prices`),
    addRiderPrice: (price: RiderPriceInput) => request<RiderPrice>('POST', `${base}/rider-prices`, price),
    updateRiderPrice: (id: number, price: RiderPriceInput) => request<RiderPrice>('PUT', `${base}/rider-prices/${id}`, price),
    deleteRiderPrice: (id: number) => request<void>('DELETE', `${base}/rider-prices/${id}`),
    importRiderPrices: (file: File, dryRun: boolean) =>
      request<RiderPriceImportResult>('POST', `${base}/rider-prices/import?${qs({ dryRun: dryRun ? 1 : 0 })}`, file),
    addResidentDj: (weekId: number, dj: DjInput) => request<Item>('POST', `${base}/weeks/${weekId}/resident-djs`, dj),
    importResidentDjs: (weekId: number, file: File, dryRun: boolean) =>
      request<DjImportResult>('POST', `${base}/weeks/${weekId}/resident-djs/import?${qs({ dryRun: dryRun ? 1 : 0 })}`, file),
    paymentSchedule: (weekId: number) => request<PaymentSchedule>('GET', `${base}/weeks/${weekId}/payment-schedule`),
    paymentScheduleUrl: (weekId: number) => `/api${base}/weeks/${weekId}/payment-schedule.xlsx`,

    addRecurringDj: (dj: DjInput) => request<LineItem>('POST', `${base}/recurring/resident-djs`, dj),
    importRecurringDjs: (file: File, dryRun: boolean) =>
      request<DjImportResult>('POST', `${base}/recurring/resident-djs/import?${qs({ dryRun: dryRun ? 1 : 0 })}`, file),

    residentBookings: (from: string, to: string) =>
      request<ResidentBookingsReport>('GET', `${base}/reports/resident-bookings?${qs({ from, to })}`),

    recurring: () => request<LineItem[]>('GET', `${base}/recurring`),
    addRecurring: (item: ItemInput) => request<LineItem>('POST', `${base}/recurring`, item),
    updateRecurring: (id: number, item: ItemInput) => request<LineItem>('PUT', `${base}/recurring/${id}`, item),
    deleteRecurring: (id: number) => request<void>('DELETE', `${base}/recurring/${id}`),

    summary: (from: string, to: string, groupBy: GroupBy) =>
      request<SummaryReport>('GET', `${base}/reports/summary?${qs({ from, to, groupBy })}`),
    top: (from: string, to: string, category: CategoryKey, limit = 10) =>
      request<TopEntry[]>('GET', `${base}/reports/top?${qs({ from, to, category, limit })}`),
    compare: (mode: CompareMode, a: string, b: string) =>
      request<CompareReport>('GET', `${base}/reports/compare?${qs({ mode, a, b })}`),
    exportUrl: (from: string, to: string, groupBy: GroupBy) => `/api${base}/reports/export.xlsx?${qs({ from, to, groupBy })}`,

    importFile: (file: File, year: number, dryRun: boolean) =>
      request<ImportResult>('POST', `${base}/import?${qs({ year, dryRun: dryRun ? 1 : 0 })}`, file),

    // Actual expenditure: one tab of the weekly expense workbook is one week, imported as totals only.
    actuals: () => request<ActualWeekSummary[]>('GET', `${base}/actuals`),
    actualWeek: (id: number) => request<ActualWeekDetail>('GET', `${base}/actuals/${id}`),
    deleteActual: (id: number) => request<void>('DELETE', `${base}/actuals/${id}`),
    actualSheets: (file: File) => request<ActualSheetList>('POST', `${base}/actuals/sheets`, file),
    importActual: (file: File, p: ActualImportParams, dryRun: boolean) =>
      request<ActualImportPreview>(
        'POST',
        `${base}/actuals/import?${qs({
          sheet: p.sheet,
          year: p.year,
          month: p.month,
          weekNo: p.weekNo,
          adjust: p.adjust && Object.keys(p.adjust).length > 0 ? JSON.stringify(p.adjust) : undefined,
          dryRun: dryRun ? 1 : 0,
        })}`,
        file,
      ),
    variance: (from: string, to: string, groupBy: GroupBy) =>
      request<VarianceReport>('GET', `${base}/reports/variance?${qs({ from, to, groupBy })}`),
  };
}

export type OrgApi = ReturnType<typeof orgApi>;

/** Combined reports across every organisation (read-only). */
const master = {
  summary: (from: string, to: string, groupBy: GroupBy) =>
    request<SummaryReport>('GET', `/master/summary?${qs({ from, to, groupBy })}`),
  top: (from: string, to: string, category: CategoryKey, limit = 10) =>
    request<TopEntry[]>('GET', `/master/top?${qs({ from, to, category, limit })}`),
  residentBookings: (from: string, to: string) =>
    request<ResidentBookingsReport>('GET', `/master/resident-bookings?${qs({ from, to })}`),
  /** Planned against actual spend, both organisations together. */
  variance: (from: string, to: string, groupBy: GroupBy) =>
    request<VarianceReport>('GET', `/master/variance?${qs({ from, to, groupBy })}`),
  /** One organisation against another over a period. */
  compareOrgs: (a: string, b: string, from: string, to: string) =>
    request<CompareReport>('GET', `/master/compare?${qs({ mode: 'org', a, b, from, to })}`),
  /** One combined month against another. */
  compareMonths: (a: string, b: string) => request<CompareReport>('GET', `/master/compare?${qs({ mode: 'month', a, b })}`),
  exportUrl: (from: string, to: string, groupBy: GroupBy) => `/api/master/export.xlsx?${qs({ from, to, groupBy })}`,
};

export const api = {
  me: () => request<{ authenticated: boolean }>('GET', '/auth/me'),
  login: (password: string) => request<{ ok: true }>('POST', '/auth/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  organisations: () => request<Organisation[]>('GET', '/orgs'),
  org: orgApi,
  master,
};
