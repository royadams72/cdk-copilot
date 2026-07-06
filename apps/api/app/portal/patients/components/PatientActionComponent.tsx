import Link from "next/link";
import styles from "@/apps/api/app/portal/portal.module.css";
import type { PortalPatientDashboardData } from "@/apps/api/lib/portal/patient-shared";

const actionHrefByLabel: Record<string, string> = {
  "Care Plans": "/care-plans",
  Diagnoses: "/diagnoses",
  "Health Data": "/health",
  Labs: "/labs",
  Membership: "/membership",
  "Medication Profile": "/medication",
  Messaging: "/messages",
  "Nutrition Data": "/nutrition",
  "Patient targets": "/targets",
  "Reviewed Trends": "/worsening-reviewed",
  "Worsening Trends": "#attention-needed",
};

const PatientActionComponent = ({
  dashboard,
  patientId,
}: {
  dashboard: PortalPatientDashboardData | null;
  patientId: string;
}) => {
  return (
    <div className={styles.patientActionRow}>
      {dashboard?.actionCards.map((label) => {
        const href = actionHrefByLabel[label];

        if (href) {
          return (
            <Link
              className={styles.patientActionInlineLink}
              href={`/portal/patients/${patientId}${href}`}
              key={label}
              prefetch={false}
            >
              {label}
            </Link>
          );
        }

        return (
          <button
            className={styles.patientActionInlineButton}
            key={label}
            onClick={() => window.alert(`${label} is the next portal slice.`)}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default PatientActionComponent;
