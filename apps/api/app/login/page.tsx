import Link from "next/link";

import { PortalLoginForm } from "@/apps/api/app/login/portal-login-form";
import styles from "@/apps/api/app/login/portal-login.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <header className="portal-top-bar">
        <div className="portal-top-bar-inner">
          <strong className="portal-brand">CKD Copilot</strong>
          <span className="portal-org-line">
            Barts Health NHS Trust • Newham Hospital • Renal Service
          </span>
        </div>
      </header>

      <div className="portal-page-frame">
        <div aria-hidden="true" className="portal-side-gutter" />
        <section className={`portal-center-column ${styles.centerColumn}`}>
          <div className={styles.loginCanvas}>
            <div className={styles.panel}>
              <div className={styles.copy}>
                <p className={styles.kicker}>Clinical portal access</p>
                <h1 className={styles.title}>Portal session bootstrap</h1>
                <p className={styles.description}>
                  This is a temporary developer login while the clinician OTP flow is
                  still being implemented. Use an issued JWT and refresh token to enter
                  the portal shell and exercise session handling.
                </p>
              </div>

              <PortalLoginForm />

              <div className={styles.footer}>
                <span>Next planned step: replace this form with the clinician OTP flow.</span>
                <Link className={styles.footerLink} href="/portal">
                  Go to portal
                </Link>
              </div>
            </div>
          </div>
        </section>
        <div aria-hidden="true" className="portal-side-gutter" />
      </div>
    </main>
  );
}
