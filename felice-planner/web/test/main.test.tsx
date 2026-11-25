import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from './helpers.tsx';

describe('main', () => {
  it('mounts the app into #root inside a router', async () => {
    mockApi({ 'GET /auth/me': { authenticated: false } });
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    window.history.pushState({}, '', '/master');
    await import('../src/main.tsx');
    expect(await screen.findByLabelText('Password')).toBeTruthy();
    expect(root.querySelector('main.login')).not.toBeNull();
  });
});
