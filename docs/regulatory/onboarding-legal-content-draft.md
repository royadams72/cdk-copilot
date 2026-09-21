# Onboarding legal content draft

Status: **draft — not approved for production**  
Document versions: `terms-draft-2026-09-21`, `privacy-draft-2026-09-21`, `care-team-access-draft-2026-09-21`

The mobile copy is maintained in `apps/mobile/src/constants/legal.ts`. Care-team access copy is created by `apps/api/lib/utils/patientConsents.ts`.

## Intended separation

1. Care-team access is an explicit Agree/Disagree decision for a named assignment and direct-care purpose.
2. Terms and Conditions acceptance governs use of the app.
3. Privacy Notice acknowledgement confirms that transparency information was made available; it is not described as UK GDPR consent.
4. Research, service planning, marketing, and other secondary purposes are outside these decisions and require their own governance and, where applicable, separate optional choices.

## Required approval and missing production information

Before release, the responsible controller(s), Data Protection Officer or information-governance lead, clinical-safety lead, and legal adviser must approve the wording and supply:

- each controller's legal name, postal address, and role;
- Data Protection Officer and patient-contact details;
- the Article 6 lawful basis and Article 9 condition for every processing purpose;
- processor/subprocessor identities, hosting locations, and international-transfer safeguards;
- final retention periods and the applicable NHS Records Management Code schedule;
- the exact care-team access scope and withdrawal/revocation process;
- consequences of declining access and an alternative route to care;
- accessibility, age/capacity, proxy, parental-responsibility, and assisted-digital arrangements;
- applicable governing-law, liability, service-operator, support, and complaints clauses;
- confirmation of DPIA, clinical-safety, DTAC, and records-of-processing updates.

The draft screens must not be relabelled as approved merely by removing the visible draft notice. Approval should create new immutable version identifiers, and accepted records must retain the version shown to each patient.
