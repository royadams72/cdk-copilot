"use client";

import Link from "next/link";

import styles from "@/apps/api/app/portal/portal.module.css";

type PatientHeadlineContainerProps = {
  backHref: string;
  backLabel: string;
  headline: string;
  subheadline?: string | null;
};

export default function PatientHeadlineContainer({
  backHref,
  backLabel,
  headline,
  subheadline,
}: PatientHeadlineContainerProps) {
  return (
    <div className={styles.patientHeadlineContainer}>
      <Link className={styles.patientBackLink} href={backHref} prefetch={false}>
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
          {subheadline ? (
            <p className={styles.patientHeadlineMeta}>{subheadline}</p>
          ) : null}
        </div>
      </div>
      <span aria-hidden="true" className={styles.patientBackLinkSpacer}>
        {backLabel}
      </span>
    </div>
  );
}
