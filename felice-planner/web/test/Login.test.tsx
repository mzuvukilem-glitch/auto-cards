import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/pages/Login.tsx';
import { deferred, fail, mockApi } from './helpers.tsx';

describe('LoginPage', () => {
  it('shows both logos, the title and a password field that is required', () => {
    render(<LoginPage onSignedIn={() => undefined} />);
    expect(screen.getByRole('img', { name: 'Alur logo' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Felice logo' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Alur & FelicePlanner');
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(password.required).toBe(true);
    expect(password.autocomplete).toBe('current-password');
    expect(document.activeElement).toBe(password);
  });

  it('keeps Sign in disabled until a password is typed', async () => {
    const user = userEvent.setup();
    render(<LoginPage onSignedIn={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.type(screen.getByLabelText('Password'), 'x');
    expect(button.disabled).toBe(false);
  });

  it('signs in with the password and tells the app', async () => {
    const user = userEvent.setup();
    const mock = mockApi({ 'POST /auth/login': { ok: true } });
    const onSignedIn = vi.fn();
    render(<LoginPage onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText('Password'), 's3cret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(mock.calls[0]).toMatchObject({ method: 'POST', path: '/auth/login', body: { password: 's3cret' } });
  });

  it('submits with Enter', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/login': { ok: true } });
    const onSignedIn = vi.fn();
    render(<LoginPage onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText('Password'), 's3cret{Enter}');
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it('shows "Signing in…" and disables the button while waiting', async () => {
    const user = userEvent.setup();
    const pending = deferred<{ ok: true }>();
    mockApi({ 'POST /auth/login': () => pending.promise.then((r) => r) });
    render(<LoginPage onSignedIn={() => undefined} />);
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const busy = screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await act(async () => pending.resolve({ ok: true }));
  });

  it('shows the server message for a wrong password and lets you try again', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/login': fail(401, 'Wrong password') });
    const onSignedIn = vi.fn();
    render(<LoginPage onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong password');
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('clears the previous error when trying again', async () => {
    const user = userEvent.setup();
    const mock = mockApi({ 'POST /auth/login': fail(401, 'Wrong password') });
    const onSignedIn = vi.fn();
    render(<LoginPage onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    mock.set({ 'POST /auth/login': { ok: true } });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
