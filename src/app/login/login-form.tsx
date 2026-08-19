"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import styles from "../public.module.css";

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
    <form className={styles.loginForm} onSubmit={handleSubmit}>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="nama@contoh.id"
        required
      />

      <TextField
        label="Kata sandi"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••"
        minLength={8}
        required
      />

      {error ? <p className={styles.loginError} role="alert">{error}</p> : null}

      <Button className={styles.loginButton} type="submit" disabled={loading}>
        {loading ? "Memverifikasi…" : "Masuk ke KopdesKu"}
      </Button>

      <p className={styles.formNote}>Akses hanya untuk akun organisasi yang dibuat administrator. Pendaftaran publik tidak tersedia.</p>
    </form>
  );
}
