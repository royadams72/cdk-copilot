"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";

function formatLastLoggedIn(jwt: string) {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1] ?? ""));
    if (typeof payload.iat !== "number") {
      return "Unknown";
    }
    return new Date(payload.iat * 1000).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

export default function PortalHeaderBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logout, session, status } = usePortalSession();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  if (status !== "authenticated" || !session) {
    return null;
  }

  const lastLoggedIn = formatLastLoggedIn(session.jwt);

  function pushPortalQuery(nextQuery: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmedQuery = nextQuery.trim();

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    } else {
      params.delete("q");
    }

    params.delete("filter");
    router.push(`/portal${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <section className={styles.actionBar}>
      <div className={styles.searchCluster}>
        <label className={styles.inlineSearch}>
          <input
            aria-label="Search patients"
            className={styles.inputField}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                pushPortalQuery(query);
              }
            }}
            placeholder="Text field"
            type="search"
            value={query}
          />
          <button
            className={styles.buttonPrimary}
            onClick={() => pushPortalQuery(query)}
            type="button"
          >
            Search
          </button>
        </label>

        <button
          className={styles.buttonSecondary}
          onClick={() => window.alert("Advanced search is the next portal slice.")}
          type="button"
        >
          Advanced Search
        </button>
      </div>

      <div className={styles.actionCluster}>
        <span className={styles.headerMeta}>
          Logged in as <strong>{session.user.principalId}</strong>
        </span>
        <span className={styles.headerMeta}>Last logged in {lastLoggedIn}</span>
        <button
          className={styles.buttonSecondary}
          onClick={() => window.alert("Patient intake flow is the next portal slice.")}
          type="button"
        >
          Add Patient
        </button>
        <button
          className={styles.headerLogoutButton}
          onClick={() => logout("manual")}
          type="button"
        >
          Log out
        </button>
      </div>
    </section>
  );
}
