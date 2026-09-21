import { LEGAL_VERSIONS, PRIVACY_SECTIONS } from "@/constants/legal";
import { LegalDocumentScreen } from "@/screens/onboarding/LegalDocumentScreen";

export default function PrivacyNoticeScreen() {
  return <LegalDocumentScreen sections={PRIVACY_SECTIONS} title="Privacy notice" version={LEGAL_VERSIONS.privacy} />;
}
