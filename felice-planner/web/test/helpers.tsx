import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import type { Organisation } from '../../shared/types.ts';
import { OrgLayout, OrganisationsProvider } from '../src/org.tsx';

export interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, string>;
  // A request body is JSON or a File; tests read it freely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Record<string, string>;
  credentials: string | undefined;
}
export type Handler = (call: RecordedCall) => unknown;
/** What a mocked route can be: a function of the call, a ready-made Response, or the JSON to send back. */
export type Route = Handler | object | string | number | boolean | null | undefined;
export type Routes_ = Record<string, Route>;

/** A JSON response, the way the server sends one. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
/** An error response with the server's `{ error }` body. */
export const fail = (status: number, error: string): Response => json({ error }, status);
/** A response that is not JSON (an empty 204, or an HTML error page). */
export const empty = (status = 204): Response => new Response(null, { status });

export interface MockApi {
  calls: RecordedCall[];
  /** The calls made to one route, e.g. `of('PUT', '/orgs/felice/items/3')`. */
  of: (method: string, path: string) => RecordedCall[];
  fetch: ReturnType<typeof vi.fn>;
  /** Replace or add routes after the mock was installed. */
  set: (routes: Routes_) => void;
}

async function readBody(body: unknown): Promise<unknown> {
  if (typeof body === 'string') return JSON.parse(body);
  return body;
}

/**
 * Replaces `fetch` with a small router. Keys are "METHOD /path" (without /api and without the query string).
 * A value is either the JSON to answer with, a function of the call, or a function returning a `Response`.
 */
export function mockApi(initial: Routes_ = {}): MockApi {
  const table: Routes_ = { ...initial };
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace(/^\/api/, '');
    const call: RecordedCall = {
      method,
      path,
      query: Object.fromEntries(url.searchParams),
      body: await readBody(init.body),
      headers: (init.headers ?? {}) as Record<string, string>,
      credentials: init.credentials,
    };
    calls.push(call);
    const key = `${method} ${path}`;
    if (!(key in table)) throw new Error(`Unmocked request: ${key}`);
    const route = table[key];
    const result = typeof route === 'function' ? await (route as Handler)(call) : route;
    // A fixed Response can only be read once, so each request gets its own copy.
    if (result instanceof Response) return result.clone();
    return result === undefined ? empty() : json(result);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    of: (method, path) => calls.filter((c) => c.method === method && c.path === path),
    fetch: fetchMock,
    set: (routes) => Object.assign(table, routes),
  };
}

/** A promise you resolve yourself, for tests about loading states and out-of-order responses. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const felice: Organisation = { id: 1, slug: 'felice', name: 'Felice', color: '#b91c1c' };
export const alur: Organisation = { id: 2, slug: 'alur', name: 'Alur', color: '#0e7490' };
/** An organisation that has no logo, so the name is shown instead. */
export const plain: Organisation = { id: 3, slug: 'plain', name: 'Plain Co', color: '#475569' };
export const ORGS: Organisation[] = [felice, alur];

function Where() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

export interface RenderOptions {
  url?: string;
  orgs?: Organisation[];
  /** Child route patterns (below /o/:org) the element is mounted on, e.g. ['planner', 'planner/:weekId']. */
  patterns?: string[];
}

/** Renders an organisation page inside the router and organisation context, the way App does. */
export function renderOrgPage(element: ReactElement, { url = '/o/felice', orgs = ORGS, patterns = [''] }: RenderOptions = {}) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <OrganisationsProvider value={orgs}>
        <Routes>
          <Route path="/o/:org" element={<OrgLayout />}>
            {patterns.map((p) => (p === '' ? <Route key="index" index element={element} /> : <Route key={p} path={p} element={element} />))}
          </Route>
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
        <Where />
      </OrganisationsProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

/** Renders a page outside any organisation (the master pages and shared components). */
export function renderPage(element: ReactElement, { url = '/master', orgs = ORGS }: Omit<RenderOptions, 'patterns'> = {}) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <OrganisationsProvider value={orgs}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
        <Where />
      </OrganisationsProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

/** Pins "today" without freezing timers, so userEvent and waitFor keep working. */
export function freezeToday(iso = '2026-06-15T10:00:00') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

export function xlsx(name = 'data.xlsx', content = 'xlsx-bytes'): File {
  return new File([content], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const zarFormat = (digits: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: digits, maximumFractionDigits: digits });
/** A rand amount the way the app writes it (money), with ordinary spaces so Testing Library text queries match. */
export const zar = (n: number) => zarFormat(2).format(n).replace(/\s/g, ' ');
/** A rand amount without cents (money0). */
export const zar0 = (n: number) => zarFormat(0).format(n).replace(/\s/g, ' ');
/** An element's text with all whitespace (including non-breaking spaces in rand amounts) collapsed to single spaces. */
export const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** The text of each cell (th or td) of a row, in order, with whitespace collapsed. */
export const cells = (row: Element | null | undefined) => [...(row?.querySelectorAll('th,td') ?? [])].map((c) => txt(c));
/** The text of each direct child of an element (for example the label, value and hint of a KPI tile). */
export const parts = (el: Element | null | undefined) => [...(el?.children ?? [])].map((c) => txt(c));
