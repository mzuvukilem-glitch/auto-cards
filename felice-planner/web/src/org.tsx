import { createContext, useContext, useMemo } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import type { Organisation } from '../../shared/types.ts';
import { api, type OrgApi } from './api.ts';
import { OrgLogo } from './logos.tsx';

const OrganisationsContext = createContext<Organisation[]>([]);
export const OrganisationsProvider = OrganisationsContext.Provider;

/** Every organisation, for the switcher and the combined views. */
export const useOrganisations = () => useContext(OrganisationsContext);

interface OrgContextValue {
  org: Organisation;
  /** API calls for this organisation only. */
  api: OrgApi;
  /** Builds a link inside this organisation, e.g. path('/planner') -> /o/felice/planner */
  path: (suffix?: string) => string;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext);
  if (!value) throw new Error('useOrg must be used inside an organisation page');
  return value;
}

/**
 * Route wrapper for /o/:org/... It checks the organisation exists and gives its pages the right API.
 * The key remounts the page when you switch organisation, so no data or form state carries over.
 */
export function OrgLayout() {
  const { org: slug = '' } = useParams();
  const organisations = useOrganisations();
  const org = organisations.find((o) => o.slug === slug);
  const value = useMemo<OrgContextValue | null>(
    () => (org ? { org, api: api.org(org.slug), path: (suffix = '') => `/o/${org.slug}${suffix}` } : null),
    [org],
  );
  if (!value) return <Navigate to="/master" replace />;
  return (
    <OrgContext.Provider key={value.org.slug} value={value}>
      <Outlet />
    </OrgContext.Provider>
  );
}

/** The organisation's logo, shown in page headings. */
export function OrgBadge() {
  const { org } = useOrg();
  return (
    <span className="org-badge">
      <OrgLogo slug={org.slug} name={org.name} height={30} />
    </span>
  );
}
