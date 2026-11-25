import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useMatch } from 'react-router-dom';
import type { Organisation } from '../../shared/types.ts';
import { api, onUnauthorized } from './api.ts';
import { ErrorBanner } from './components.tsx';
import { errorMessage } from './lib.ts';
import { OrgLogo } from './logos.tsx';
import { OrgLayout, OrganisationsProvider } from './org.tsx';
import { ActualsPage } from './pages/Actuals.tsx';
import { ComparePage } from './pages/Compare.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { DataPage } from './pages/Data.tsx';
import { LoginPage } from './pages/Login.tsx';
import { MasterActualsPage } from './pages/MasterActuals.tsx';
import { MasterComparePage } from './pages/MasterCompare.tsx';
import { MasterDashboardPage } from './pages/MasterDashboard.tsx';
import { MasterReportsPage } from './pages/MasterReports.tsx';
import { PlannerPage } from './pages/Planner.tsx';
import { RecurringPage } from './pages/Recurring.tsx';
import { RiderPricesPage } from './pages/RiderPrices.tsx';
import { ReportsPage } from './pages/Reports.tsx';

type AuthState = 'checking' | 'signed-in' | 'signed-out';

const MASTER_NAV = [
  { to: '/master', label: 'Master dashboard', end: true },
  { to: '/master/reports', label: 'Combined reports', end: false },
  { to: '/master/actuals', label: 'Plan vs actual', end: false },
  { to: '/master/compare', label: 'Compare', end: false },
];

const ORG_NAV = [
  { suffix: '', label: 'Dashboard', end: true },
  { suffix: '/planner', label: 'Weekly planner', end: false },
  { suffix: '/recurring', label: 'Recurring costs', end: false },
  { suffix: '/rider-prices', label: 'Rider prices', end: false },
  { suffix: '/reports', label: 'Reports', end: false },
  { suffix: '/actuals', label: 'Plan vs actual', end: false },
  { suffix: '/compare', label: 'Compare', end: false },
  { suffix: '/data', label: 'Import & export', end: false },
];

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');

  useEffect(() => {
    onUnauthorized(() => setAuth('signed-out'));
    api
      .me()
      .then((r) => setAuth(r.authenticated ? 'signed-in' : 'signed-out'))
      .catch(() => setAuth('signed-out'));
  }, []);

  if (auth === 'checking') return null;
  if (auth === 'signed-out') return <LoginPage onSignedIn={() => setAuth('signed-in')} />;
  return <Shell onSignOut={() => setAuth('signed-out')} />;
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [orgs, setOrgs] = useState<Organisation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .organisations()
      .then(setOrgs)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    onSignOut();
  };

  if (error) return <ErrorBanner message={error} />;
  if (!orgs) return null;

  return (
    <OrganisationsProvider value={orgs}>
      <div className="shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Sidebar orgs={orgs} onSignOut={signOut} />
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/master" element={<MasterDashboardPage />} />
            <Route path="/master/reports" element={<MasterReportsPage />} />
            <Route path="/master/actuals" element={<MasterActualsPage />} />
            <Route path="/master/compare" element={<MasterComparePage />} />
            <Route path="/o/:org" element={<OrgLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="planner" element={<PlannerPage />} />
              <Route path="planner/:weekId" element={<PlannerPage />} />
              <Route path="recurring" element={<RecurringPage />} />
              <Route path="rider-prices" element={<RiderPricesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="actuals" element={<ActualsPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="data" element={<DataPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/master" replace />} />
          </Routes>
        </main>
      </div>
    </OrganisationsProvider>
  );
}

function Sidebar({ orgs, onSignOut }: { orgs: Organisation[]; onSignOut: () => void }) {
  const orgMatch = useMatch('/o/:org/*');
  const current = orgs.find((o) => o.slug === orgMatch?.params.org);

  return (
    <aside className="sidebar">
      <div className="brand">
        Alur &amp; Felice<span>Planner</span>
      </div>

      <nav aria-label="Organisation">
        <ul className="org-switch">
          <li>
            <NavLink to="/master">
              <span className="dot" style={{ background: '#475569' }} aria-hidden="true" />
              All organisations
            </NavLink>
          </li>
          {orgs.map((o) => (
            <li key={o.slug}>
              <NavLink to={`/o/${o.slug}`}>
                <OrgLogo slug={o.slug} name={o.name} height={36} decorative transparent />
                <span className="sr-only">{o.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label={current ? `${current.name} pages` : 'Master pages'}>
        <ul>
          {current
            ? ORG_NAV.map((n) => (
                <li key={n.suffix}>
                  <NavLink to={`/o/${current.slug}${n.suffix}`} end={n.end}>
                    {n.label}
                  </NavLink>
                </li>
              ))
            : MASTER_NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} end={n.end}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
        </ul>
      </nav>

      <button type="button" className="link-button signout" onClick={onSignOut}>
        Sign out
      </button>
    </aside>
  );
}
