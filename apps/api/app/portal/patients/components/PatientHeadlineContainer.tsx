"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import styles from "@/apps/api/app/portal/portal.module.css";

type PatientHeadlineContainerProps = {
  backHref: string;
  backLabel: string;
  headline: string;
  subheadline?: string | null;
  warningLabel?: ReactNode;
};

export default function PatientHeadlineContainer({
  backHref,
  backLabel,
  headline,
  subheadline,
  warningLabel,
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
            <h1 className={styles.patientHeadlineText}>{headline}</h1>
          </div>
          {subheadline ? (
            <p className={styles.patientHeadlineMeta}>
              {subheadline}
              {warningLabel ? (
                <>
                  {" "}
                  <span className={styles.patientHeadlineWarning}>
                    {warningLabel}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
