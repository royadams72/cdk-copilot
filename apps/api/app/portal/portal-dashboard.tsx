"use client";

import Image from "next/image";
import Link from "next/link";

import { usePortalSession } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";

const STAT_CARDS = [
  {
    detail: "Repeated decline in nutrition, activity, weight or blood pressure.",
    icon: "/portal/icons/trend icon.png",
    label: "Worsening trends this month",
    tone: "warning",
    value: "18 patients",
  },
  {
    detail: "Need their care plans reviewed",
    icon: "/portal/icons/review icon.png",
    label: "Care plan review due",
    tone: "warning",
    value: "20 patients",
  },
  {
    detail: "Not logging or syncing key data.",
    icon: "/portal/icons/trend icon2.png",
    label: "Missing data / disengaged",
    tone: "warning",
    value: "7 patients",
  },
  {
    detail: "Access will be ending in the next few weeks.",
    icon: "/portal/icons/user icon.png",
    label: "Access ending soon",
    tone: "accent",
    value: "12 patients",
  },
] as const;

const PATIENT_ROWS = [
  {
    dob: "04/07/1978",
    name: "Patient List Panel Name",
  },
  {
    dob: "12/10/1981",
    name: "Patient List Panel Name (Alt)",
  },
  {
    dob: "21/01/1975",
    name: "Patient List Panel Name",
  },
] as const;

export function PortalDashboard() {
  const { clearWarning, isLeaderTab, lastActivityAt, logout, session, status, warningOpen } =
    usePortalSession();

  if (status === "loading") {
    return <section className={styles.emptyState}>Checking portal session...</section>;
  }

  if (status !== "authenticated" || !session) {
    return (
      <section className={styles.emptyState}>
        <h2>Portal session required</h2>
        <p>Use the temporary bootstrap form to load a JWT and refresh token.</p>
        <Link className={styles.inlineLink} href="/login">
          Open login
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className={styles.actionBar}>
        <div className={styles.searchCluster}>
          <label className={styles.inlineSearch}>
            <input
              aria-label="Search patients"
              className={styles.inputField}
              placeholder="Text field"
              type="search"
            />
            <button className={styles.buttonPrimary} type="button">
              Search
            </button>
          </label>

          <button className={styles.buttonSecondary} type="button">
            Advanced Search
          </button>
        </div>

        <div className={styles.actionCluster}>
          <button className={styles.buttonSecondary} type="button">
            Add Patient
          </button>
        </div>
      </section>

      <section className={styles.metaStrip}>
        <span>
          Logged in as <strong>{session.user.principalId}</strong>
        </span>
        <span>{isLeaderTab ? "Leader tab" : "Follower tab"}</span>
        <span>Last activity {new Date(lastActivityAt).toLocaleTimeString("en-GB")}</span>
        <button className={styles.buttonGhost} onClick={() => logout("manual")} type="button">
          Log out
        </button>
      </section>

      <section className={styles.statGrid}>
        {STAT_CARDS.map((card) => (
          <article className={styles.statCard} data-tone={card.tone} key={card.label}>
            <div className={styles.statCardBody}>
              <h2 className={styles.statTitle}>{card.label}</h2>
              <strong className={styles.statValue}>{card.value}</strong>
              <p className={styles.statDetail}>{card.detail}</p>
            </div>
            <span className={styles.iconBadge}>
              <Image alt="" height={24} src={card.icon} width={24} />
            </span>
          </article>
        ))}
      </section>

      <section className={styles.panelSurface}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listHeaderTitle}>Patient List Panel Name</span>
          <button className={styles.buttonPrimaryCompact} type="button">
            View Stats
          </button>
        </div>

        <div className={styles.patientList}>
          {PATIENT_ROWS.map((row) => (
            <div className={styles.patientListRow} key={`${row.name}-${row.dob}`}>
              <div className={styles.patientLabel}>
                {row.name} <span className={styles.patientMeta}>({row.dob})</span>
              </div>
              <button className={styles.buttonPrimaryCompact} type="button">
                View Stats
              </button>
            </div>
          ))}
        </div>
      </section>

      {warningOpen && isLeaderTab ? (
        <div className={styles.warningModalBackdrop}>
          <div className={`${styles.modalCard} ${styles.modalWarning}`}>
            <h3 className={styles.modalTitle}>Session warning</h3>
            <p className={styles.modalCopy}>
              No activity has been detected for 18 minutes. Interact with the portal
              to keep the session alive.
            </p>
            <div className={styles.warningActions}>
              <button className={styles.buttonSecondarySmall} onClick={clearWarning} type="button">
                Stay signed in
              </button>
              <button className={styles.buttonPrimarySmall} onClick={() => logout("manual")} type="button">
                Log out now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
