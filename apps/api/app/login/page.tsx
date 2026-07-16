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
        <section className={`portal-center-column ${styles.centerColumn}`}>
          <div className={styles.loginCanvas}>
            <div className={styles.panel}>
              <div className={styles.copy}>
                <p className={styles.kicker}>Clinical portal access</p>
                <h1 className={styles.title}>Sign in with a one-time code</h1>
                <p className={styles.description}>
                  Enter your NHS or service email address and we will send a six-digit
                  login code. For local development without email delivery, the code will
                  also be shown on screen.
                </p>
                <p className={styles.screenNotice}>
                  This portal is intended for desktop and tablet screen sizes.
                </p>
                <div className={styles.mobileViewportNotice}>
                  This screen is too small for the clinical portal. Please use a
                  tablet, desktop, or a wider browser window.
                </div>
              </div>

              <PortalLoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
