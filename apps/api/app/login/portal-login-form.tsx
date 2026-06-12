"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { savePortalSessionSnapshot } from "@/apps/api/lib/portal/session";

import styles from "@/apps/api/app/login/portal-login.module.css";

type RequestCodeResponse = {
  data?: {
    devCode?: string;
    message?: string;
  };
  message?: string;
  ok?: boolean;
};

type VerifyCodeResponse = {
  data?: {
    jwt?: string;
    refreshToken?: string;
  };
  message?: string;
  ok?: boolean;
};

export function PortalLoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [hasRequestedCode, setHasRequestedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const trimmedEmail = email.trim();
  const trimmedCode = code.trim();
  const canRequestCode = trimmedEmail.length > 0;
  const canVerifyCode = trimmedEmail.length > 0 && trimmedCode.length === 6;

  function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError(null);
    setNotice(null);

    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/portal/auth/request-code", {
        body: JSON.stringify({ email: trimmedEmail }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as RequestCodeResponse | null;

      if (!response.ok || !body?.ok) {
        setError(body?.message || "Unable to send the login code.");
        return;
      }

      setHasRequestedCode(true);
      setDevCode(body.data?.devCode ?? null);
      setNotice(body.data?.message || "If the account exists, a login code has been sent.");
    });
  }

  function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (trimmedCode.length !== 6) {
      setError("Enter the six-digit code.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/portal/auth/verify-code", {
        body: JSON.stringify({ code: trimmedCode, email: trimmedEmail }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as VerifyCodeResponse | null;
      const jwt = body?.data?.jwt?.trim();

      if (!response.ok || !body?.ok || !jwt) {
        setError(body?.message || "Unable to verify the login code.");
        return;
      }

      savePortalSessionSnapshot({
        jwt,
        refreshToken: body?.data?.refreshToken?.trim() || null,
      });

      router.push("/portal");
      router.refresh();
    });
  }

  return (
    <form className={styles.form} onSubmit={hasRequestedCode ? verifyCode : requestCode}>
      <label className={styles.field}>
        <span className={styles.label}>Email address</span>
        <input
          autoCapitalize="none"
          autoCorrect="off"
          className={styles.control}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@trust.nhs.uk"
          spellCheck={false}
          type="email"
          value={email}
        />
      </label>

      {hasRequestedCode ? (
        <label className={styles.field}>
          <span className={styles.label}>Six-digit code</span>
          <input
            className={styles.control}
            inputMode="numeric"
            maxLength={6}
            name="code"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            type="text"
            value={code}
          />
        </label>
      ) : null}

      {devCode ? (
        <div className={styles.devPanel}>
          <span className={styles.devLabel}>Local development code</span>
          <strong className={styles.devCode}>{devCode}</strong>
        </div>
      ) : null}

      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        {hasRequestedCode ? (
          <button
            className={styles.secondaryButton}
            disabled={pending || !canRequestCode}
            onClick={() => requestCode()}
            type="button"
          >
            Resend code
          </button>
        ) : (
          <span />
        )}

        <button
          className={styles.primaryButton}
          data-pending={pending ? "true" : "false"}
          disabled={pending || (hasRequestedCode ? !canVerifyCode : !canRequestCode)}
          type="submit"
        >
          {pending
            ? hasRequestedCode
              ? "Checking code..."
              : "Sending code..."
            : hasRequestedCode
              ? "Sign in"
              : "Send code"}
        </button>
      </div>
    </form>
  );
}
