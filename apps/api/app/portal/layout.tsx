import type { ReactNode } from "react";

import { PortalSessionProvider } from "@/apps/api/app/portal/portal-session-provider";
import styles from "@/apps/api/app/portal/portal.module.css";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalSessionProvider>
      <div className={styles.portalShell}>
        <header className={styles.topBar}>
          <div className={styles.topBarInner}>
            <strong className={styles.brand}>CKD Copilot</strong>
            <span className={styles.orgLine}>
              Barts Health NHS Trust • Newham Hospital • Renal Service
            </span>
          </div>
        </header>

        <div className={styles.pageFrame}>
          <div aria-hidden="true" className={styles.sideGutter} />
          <div className={styles.centerColumn}>{children}</div>
          <div aria-hidden="true" className={styles.sideGutter} />
        </div>
      </div>
    </PortalSessionProvider>
  );
}
