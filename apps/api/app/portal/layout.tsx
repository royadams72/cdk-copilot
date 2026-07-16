import { Suspense, type ReactNode } from "react";

import { PortalSessionProvider } from "@/apps/api/app/portal/portal-session-provider";
import PortalHeaderBar from "@/apps/api/app/portal/components/PortalHeaderBar";
import styles from "@/apps/api/app/portal/portal.module.css";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalSessionProvider>
      <div className={styles.portalShell}>
        <a className={styles.skipLink} href="#portal-main">
          Skip to main content
        </a>
        <header className={styles.topBar}>
          <div className={styles.topBarInner}>
            <strong className={styles.brand}>CKD Copilot</strong>
            <span className={styles.orgLine}>
              Barts Health NHS Trust • Newham Hospital • Renal Service
            </span>
          </div>
          <Suspense fallback={null}>
            <PortalHeaderBar />
          </Suspense>
        </header>

        <main id="portal-main" tabIndex={-1}>
          <section className={styles.unsupportedViewportNotice}>
            <div className={styles.unsupportedViewportCard}>
            <h1 className={styles.unsupportedViewportTitle}>
              Desktop or tablet required
            </h1>
            <p className={styles.unsupportedViewportCopy}>
              The clinical portal is currently designed for desktop and tablet
              screen sizes. Please use a larger device or widen this window to
              continue.
            </p>
            </div>
          </section>

          <div className={styles.portalSupportedContent}>
            <div className={styles.pageFrame}>
              <div className={styles.centerColumn}>{children}</div>
            </div>
          </div>
        </main>
      </div>
    </PortalSessionProvider>
  );
}
