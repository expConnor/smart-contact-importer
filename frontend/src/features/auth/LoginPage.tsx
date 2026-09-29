import type { FormEvent } from 'react';
import { ApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/errors';
import { ErrorMessage } from '@/shared/ui/ErrorMessage';
import { useLogin } from './session';
import './login.css';

// 400 (malformed email) and 401 (bad password) both mean "you typed it wrong".
// Anything else is the server's fault, so show what it said.
function loginErrorText(error: Error): string {
  if (
    error instanceof ApiError &&
    (error.status === 400 || error.status === 401)
  ) {
    return 'Wrong email or password. Try again.';
  }
  return errorText(error);
}

export function LoginPage() {
  const login = useLogin();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
  }

  return (
    <main className="login">
      <form className="panel login-panel" onSubmit={onSubmit}>
        <div>
          <h1 className="login-title">Contact importer</h1>
          <p className="muted">Log in to continue.</p>
        </div>
        <label className="field">
          <span className="label">Email</span>
          <input
            className="input"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {login.error && (
          <ErrorMessage>{loginErrorText(login.error)}</ErrorMessage>
        )}
        <button
          className="button button-primary"
          type="submit"
          disabled={login.isPending}
        >
          Log in
        </button>
      </form>
    </main>
  );
}
