"use client";

import type { ReactNode } from "react";

import styles from "@/apps/api/app/portal/portal.module.css";

type PatientOverviewPanelProps = {
  children: ReactNode;
  id?: string;
  title: string;
};

export default function PatientOverviewPanel({
  children,
  id,
  title,
}: PatientOverviewPanelProps) {
  return (
    <article className={styles.patientOverviewPanel} id={id}>
      <div className={styles.patientOverviewHeader}>
        <h3 className={styles.patientOverviewTitle}>{title}</h3>
      </div>
      <div className={styles.patientOverviewBody}>{children}</div>
    </article>
  );
}
