import { Suspense } from "react";

import styles from "@/apps/api/app/portal/portal.module.css";

import PortalAdvancedSearchPageClient from "./PortalAdvancedSearchPageClient";

export const dynamic = "force-dynamic";

export default function PortalAdvancedSearchPage() {
  return (
    <Suspense
      fallback={
        <section className={styles.emptyState}>Loading advanced search...</section>
      }
    >
      <PortalAdvancedSearchPageClient />
    </Suspense>
  );
}
