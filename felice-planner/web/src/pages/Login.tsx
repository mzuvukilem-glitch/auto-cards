import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { ErrorBanner } from '../components.tsx';
import { errorMessage } from '../lib.ts';
import { OrgLogo, SIGN_IN_ORGS } from '../logos.tsx';

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSignedIn();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-logos">
          {SIGN_IN_ORGS.map((o) => (
            <OrgLogo key={o.slug} slug={o.slug} name={o.name} variant="full" height={54} />
          ))}
        </div>
        <h1>
          Alur &amp; Felice<span>Planner</span>
        </h1>
        <p className="muted">Marketing and entertainment budget planner</p>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
        <ErrorBanner message={error} />
        <button type="submit" className="primary" disabled={busy || password === ''}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
