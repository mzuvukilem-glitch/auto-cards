import type { DatabaseSync } from 'node:sqlite';
import type { Organisation } from '../../shared/types.ts';
import { listOrganisations } from './db.ts';
import { createReports, type Reports } from './reports.ts';
import { createRepo, type Repo } from './repo.ts';

export interface Scope {
  /** The organisations this scope covers: one for a company, all of them for the master view. */
  orgs: Organisation[];
  repo: Repo;
  reports: Reports;
}

/** Hands out the data access for one organisation, or for all of them combined (read-only). */
export function createStores(db: DatabaseSync) {
  const organisations = listOrganisations(db);
  const make = (orgs: Organisation[]): Scope => {
    const repo = createRepo(db, orgs.map((o) => o.id));
    return { orgs, repo, reports: createReports(db, repo, orgs) };
  };
  const bySlug = new Map(organisations.map((o) => [o.slug, make([o])]));
  const combined = make(organisations);

  return {
    organisations,
    /** Scope for one organisation, or undefined if the slug is unknown. */
    forOrg: (slug: string): Scope | undefined => bySlug.get(slug),
    /** Every organisation together. Reads only. */
    all: (): Scope => combined,
  };
}

export type Stores = ReturnType<typeof createStores>;
