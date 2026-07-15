import { Suspense } from "react";

import { PortalLoadingState } from "@/apps/api/app/portal/components/PortalLoadingState";

import PortalAdvancedSearchPageClient from "./PortalAdvancedSearchPageClient";

export const dynamic = "force-dynamic";

export default function PortalAdvancedSearchPage() {
  return (
    <Suspense fallback={<PortalLoadingState label="Loading advanced search..." />}>
      <PortalAdvancedSearchPageClient />
    </Suspense>
  );
}
