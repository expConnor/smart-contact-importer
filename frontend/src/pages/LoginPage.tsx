import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, login } from '../api';

// 400 (malformed email) and 401 (bad password) both mean "you typed it wrong".
// Anything else is the server's fault, so show what it said.
function errorCopy(error: Error): string {
  if (!(error instanceof ApiError)) return error.message;
  if (error.status === 400 || error.status === 401) {
    return 'Wrong email or password. Try again.';
  }
  return `${error.message} (${error.status})`;
}

export function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    // The global 401 handler skips this key: here 401 means wrong password.
    mutationKey: ['login'],
    mutationFn: login,
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      navigate('/contacts', { replace: true });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
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
        {mutation.error && (
          <p className="error" role="alert">
            ✕ {errorCopy(mutation.error)}
          </p>
        )}
        <button
          className="button button-primary"
          type="submit"
          disabled={mutation.isPending}
        >
          Log in
        </button>
      </form>
    </main>
  );
}
