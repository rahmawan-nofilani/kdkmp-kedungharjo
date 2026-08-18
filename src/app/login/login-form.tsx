"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Email atau kata sandi tidak valid.");
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nama@contoh.id"
          required
        />
      </label>

      <label>
        <span>Kata sandi</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          minLength={8}
          required
        />
      </label>

      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Memverifikasi…" : "Masuk ke KDKMP"}
      </button>

      <p className="form-note">
        Akses hanya untuk akun yang dibuat administrator organisasi. Pendaftaran publik tidak dibuka.
      </p>
    </form>
  );
}
