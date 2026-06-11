"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import {
  clearPortalSessionSnapshot,
  readPortalSessionSnapshot,
  savePortalSessionSnapshot,
} from "@/apps/api/lib/portal/session";

import styles from "@/apps/api/app/login/portal-login.module.css";

export function PortalLoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const existing = readPortalSessionSnapshot();
  const [jwt, setJwt] = useState(existing?.jwt ?? "");
  const [refreshToken, setRefreshToken] = useState(existing?.refreshToken ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const trimmedJwt = jwt.trim();
      const trimmedRefreshToken = refreshToken.trim();

      if (!trimmedJwt) {
        setError("JWT is required.");
        return;
      }

      savePortalSessionSnapshot({
        jwt: trimmedJwt,
        refreshToken: trimmedRefreshToken || null,
      });

      const response = await fetch("/api/portal/session", {
        headers: {
          authorization: `Bearer ${trimmedJwt}`,
        },
      });

      const body = (await response.json().catch(() => null)) as
        | {
            message?: string;
            ok?: boolean;
          }
        | null;

      if (!response.ok) {
        clearPortalSessionSnapshot();
        setError(body?.message || "Session validation failed.");
        return;
      }

      router.push("/portal");
      router.refresh();
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.label}>JWT</span>
        <textarea
          autoCapitalize="none"
          autoCorrect="off"
          className={`${styles.control} ${styles.textarea}`}
          name="jwt"
          onChange={(event) => setJwt(event.target.value)}
          placeholder="Paste the JWT here"
          rows={7}
          spellCheck={false}
          value={jwt}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Refresh token</span>
        <input
          autoCapitalize="none"
          autoCorrect="off"
          className={styles.control}
          name="refreshToken"
          onChange={(event) => setRefreshToken(event.target.value)}
          placeholder="Optional but recommended"
          spellCheck={false}
          type="text"
          value={refreshToken}
        />
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <button className={styles.secondaryButton} type="button">
          Request OTP
        </button>
        <button className={styles.primaryButton} disabled={pending} type="submit">
          {pending ? "Checking session..." : "Enter portal"}
        </button>
      </div>
    </form>
  );
}
