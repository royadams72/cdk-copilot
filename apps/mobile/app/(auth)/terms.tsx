import { LEGAL_VERSIONS, TERMS_SECTIONS } from "@/constants/legal";
import { LegalDocumentScreen } from "@/screens/onboarding/LegalDocumentScreen";

export default function TermsScreen() {
  return <LegalDocumentScreen sections={TERMS_SECTIONS} title="Terms and conditions" version={LEGAL_VERSIONS.terms} />;
}
