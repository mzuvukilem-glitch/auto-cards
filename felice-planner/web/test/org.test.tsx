import { render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OrgLogo, SIGN_IN_ORGS } from '../src/logos.tsx';
import { OrgBadge, useOrg, useOrganisations } from '../src/org.tsx';
import { felice, mockApi, plain, renderOrgPage } from './helpers.tsx';

describe('OrgLogo', () => {
  it('shows the wordmark in a labelled tile by default', () => {
    render(<OrgLogo slug="alur" name="Alur" />);
    const tile = screen.getByRole('img', { name: 'Alur logo' });
    expect(tile.className).toBe('logo-tile');
    expect(tile.querySelector('img')!.getAttribute('src')).toContain('alur-mark');
    expect(tile.querySelector('img')!.getAttribute('alt')).toBe('');
    expect(tile.style.height).toBe('40px');
    expect(tile.style.width).toBe('96px');
  });

  it('shows the full logo with its tagline when asked', () => {
    render(<OrgLogo slug="felice" name="Felice" variant="full" height={54} />);
    const tile = screen.getByRole('img', { name: 'Felice logo' });
    expect(tile.querySelector('img')!.getAttribute('src')).toContain('felice-full');
    expect(tile.style.width).toBe('130px');
  });

  it('is hidden from screen readers when decorative, and can sit on a dark surface', () => {
    const { container } = render(<OrgLogo slug="felice" name="Felice" decorative transparent />);
    expect(screen.queryByRole('img')).toBeNull();
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.getAttribute('aria-hidden')).toBe('true');
    expect(tile.className).toBe('logo-tile transparent');
  });

  it('shows the name when the organisation has no logo', () => {
    render(<OrgLogo slug="plain" name="Plain Co" />);
    expect(screen.getByText('Plain Co').className).toBe('logo-fallback');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('knows the logos shown before sign-in', () => {
    expect(SIGN_IN_ORGS.map((o) => o.slug)).toEqual(['alur', 'felice']);
  });
});

describe('organisation context', () => {
  it('useOrganisations is empty outside a provider', () => {
    const { result } = renderHook(() => useOrganisations());
    expect(result.current).toEqual([]);
  });

  it('useOrg refuses to run outside an organisation page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useOrg())).toThrow('useOrg must be used inside an organisation page');
  });

  it('OrgLayout gives its pages the organisation, its API and a link builder', async () => {
    const mock = mockApi({ 'GET /orgs/felice/weeks': [] });
    function Probe() {
      const { org, api, path } = useOrg();
      return (
        <div>
          <p>{org.name}</p>
          <p data-testid="path">{path('/planner')}</p>
          <p data-testid="root">{path()}</p>
          <button type="button" onClick={() => void api.weeks()}>
            load
          </button>
        </div>
      );
    }
    const { user } = renderOrgPage(<Probe />);
    expect(screen.getByText('Felice')).toBeTruthy();
    expect(screen.getByTestId('path').textContent).toBe('/o/felice/planner');
    expect(screen.getByTestId('root').textContent).toBe('/o/felice');
    await user.click(screen.getByRole('button', { name: 'load' }));
    expect(mock.calls[0]).toMatchObject({ method: 'GET', path: '/orgs/felice/weeks' });
  });

  it('OrgLayout sends an unknown organisation to the master dashboard', () => {
    renderOrgPage(<p>never</p>, { url: '/o/nope' });
    expect(screen.queryByText('never')).toBeNull();
    expect(screen.getByTestId('elsewhere')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/master');
  });

  it('OrgBadge shows the organisation logo, or its name when it has none', () => {
    renderOrgPage(<OrgBadge />);
    expect(screen.getByRole('img', { name: 'Felice logo' })).toBeTruthy();
  });

  it('OrgBadge falls back to the name for an organisation without a logo', () => {
    renderOrgPage(<OrgBadge />, { url: '/o/plain', orgs: [felice, plain] });
    expect(screen.getByText('Plain Co').className).toBe('logo-fallback');
  });

  it('remounts the page when the organisation changes, so no form state carries over', async () => {
    function Probe() {
      const [draft, setDraft] = useState('');
      return (
        <div>
          <p>{useOrg().org.name}</p>
          <input aria-label="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Link to="/o/alur">Switch</Link>
        </div>
      );
    }
    const { user } = renderOrgPage(<Probe />);
    await user.type(screen.getByLabelText('draft'), 'half-written');
    await user.click(screen.getByRole('link', { name: 'Switch' }));
    expect(screen.getByText('Alur')).toBeTruthy();
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('');
  });
});
