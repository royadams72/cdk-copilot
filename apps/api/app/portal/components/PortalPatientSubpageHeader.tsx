"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import styles from "@/apps/api/app/portal/portal.module.css";

type PortalPatientSubpageHeaderProps = {
  action?: ReactNode;
  backHref: string;
  backLabel: string;
  headline: string;
};

export function PortalPatientSubpageHeader({
  action,
  backHref,
  backLabel,
  headline,
}: PortalPatientSubpageHeaderProps) {
  return (
    <div className={styles.patientHeadlineContainer}>
      <Link className={styles.patientBackLink} href={backHref}>
        &larr; {backLabel}
      </Link>
      <div className={styles.patientHeadline}>
        <span aria-hidden="true" className={styles.patientHeadlineIcon}>
          <span className={styles.patientHeadlineAvatarHead} />
          <span className={styles.patientHeadlineAvatarBody} />
        </span>
        <div className={styles.patientHeadlineContent}>
          <div className={styles.patientHeadlineRow}>
            <div className={styles.patientHeadlineText}>{headline}</div>
          </div>
        </div>
      </div>
      {action ?? (
        <span aria-hidden="true" className={styles.patientBackLinkSpacer}>
          {backLabel}
        </span>
      )}
    </div>
  );
}
