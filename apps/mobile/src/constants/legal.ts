export { LEGAL_DOCUMENT_VERSIONS as LEGAL_VERSIONS } from "@ckd/core";

export type LegalSection = { heading: string; paragraphs: string[] };

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "About CKD Copilot",
    paragraphs: [
      "CKD Copilot helps people with chronic kidney disease record and review health information and share relevant information with an authorised care team.",
      "The app supports, but does not replace, professional medical care. Do not use it for emergencies. Call 999 in an emergency or use NHS 111 when you need urgent medical help.",
    ],
  },
  {
    heading: "Using the app",
    paragraphs: [
      "You must provide accurate information where reasonably possible, keep your sign-in details and device secure, and tell your care team if information shown in the app appears incorrect.",
      "Targets, trends and educational information are not a diagnosis or an instruction to start, stop or change treatment. Follow advice given directly by qualified healthcare professionals.",
    ],
  },
  {
    heading: "Availability and changes",
    paragraphs: [
      "We aim to keep CKD Copilot available and secure, but cannot promise uninterrupted availability. Features may change to improve safety, meet legal requirements or support the service.",
      "If these terms materially change, we will show the updated version and ask you to review it where required.",
    ],
  },
  {
    heading: "Access ending",
    paragraphs: [
      "Your access may end when your care-team assignment expires or is withdrawn. Ending app access does not remove health records that your healthcare organisation must retain under applicable law and policy.",
    ],
  },
  {
    heading: "Contact and complaints",
    paragraphs: [
      "Contact the care organisation named in your invitation for questions about care, access, these terms or a complaint. The final production version must also state the service operator's legal name, postal address and support contact.",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "Who is responsible for your information",
    paragraphs: [
      "The NHS care organisation named in your invitation is responsible for information used to provide your direct care. CKD Copilot processes information to provide the app on behalf of, or alongside, that organisation according to the agreed governance arrangements.",
      "The final production notice must name each controller, describe their roles, and provide their postal address and Data Protection Officer contact details.",
    ],
  },
  {
    heading: "Information we use",
    paragraphs: [
      "This may include identity and contact details, NHS number, date of birth, kidney and other health conditions, medicines, allergies, laboratory results, symptoms, measurements, meals, activity, care plans, app activity and technical security records.",
      "If you choose to connect Apple Health or Android Health Connect, the app uses only the health categories you authorise through your device settings.",
    ],
  },
  {
    heading: "Why we use it",
    paragraphs: [
      "We use information to provide and secure CKD Copilot, support your individual care, display your records and trends, enable authorised care-team access, communicate service information and meet clinical-safety, audit and legal obligations.",
      "Direct-care processing should be documented under the appropriate UK GDPR Article 6 lawful basis and Article 9 health or social-care condition. This acknowledgement is not used to create a false choice where processing is required for care or legal obligations.",
    ],
  },
  {
    heading: "Sharing and access",
    paragraphs: [
      "Information is available only to you, authorised members of an accepted care-team assignment, and approved service providers who need it to operate the service. We do not sell your health information.",
      "Research, planning, marketing or other uses beyond your individual care require their own lawful basis and, where applicable, a separate optional choice. They are not authorised by this acknowledgement.",
    ],
  },
  {
    heading: "Retention, security and international transfers",
    paragraphs: [
      "Information is protected using access controls, audit records and appropriate technical and organisational safeguards. Health records are retained according to the responsible healthcare organisation's retention schedule and applicable NHS requirements.",
      "The final production notice must state applicable retention periods, key processors, hosting locations and safeguards for any transfer outside the United Kingdom.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "Depending on the circumstances, you may ask for access, correction, restriction, objection, portability or erasure. Some rights are limited where information must be retained for care or legal reasons. Contact the responsible care organisation or its Data Protection Officer to exercise your rights.",
      "You may complain to the organisation first and may also complain to the Information Commissioner's Office at ico.org.uk or by calling 0303 123 1113.",
    ],
  },
];
