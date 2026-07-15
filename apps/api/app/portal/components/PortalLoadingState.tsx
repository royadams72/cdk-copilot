"use client";

import Image from "next/image";

import styles from "@/apps/api/app/portal/portal.module.css";

type Props = {
  label: string;
};

export function PortalLoadingState({ label }: Props) {
  return (
    <section className={styles.loadingState}>
      <div className={styles.loadingStateIconWrap} aria-hidden="true">
        <Image
          alt=""
          className={styles.loadingStateIcon}
          height={86}
          src="/portal/loader.svg"
          width={86}
        />
      </div>
      <p className={styles.loadingStateLabel}>{label}</p>
    </section>
  );
}
