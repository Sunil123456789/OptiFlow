import { FormEvent, useState } from "react";

import { login } from "../../../lib/api";
import type { AuthUser } from "../../../lib/types";

type LoginPageProps = {
  onLoggedIn: (user: AuthUser) => void;
};

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [email, setEmail] = useState("admin@optiflow.local");
  const [password, setPassword] = useState("changeme");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);
      const user = await login(email, password);
      onLoggedIn(user);
    } catch {
      setError("Login failed. Check email and password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-shell">
      <article className="login-card">
        <p className="eyebrow">OptiFlow</p>
        <h2>Sign In</h2>
        <p className="login-copy">Access maintenance data with your role permissions.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="primary-btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing In..." : "Sign In"}
          </button>
        </form>

        {error && <p className="state-note error">{error}</p>}

        <p className="metric-hint">Default dev users: admin, maintenance lead, technician.</p>
      </article>
    </section>
  );
}


