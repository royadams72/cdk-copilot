import { buildCareTeamConsentCopy } from "../lib/utils/patientConsents";
import { summarizeAssignmentState } from "../lib/utils/patientAssignments";

describe("patient consent utilities", () => {
  it("summarizes active assignment state", () => {
    expect(
      summarizeAssignmentState([
        {
          assignmentId: "asg_1",
          careTeamId: "team_1",
          consentStatus: "accepted",
          createdAt: new Date().toISOString(),
          facilityId: "facility_1",
          orgId: "org_1",
          status: "active",
          updatedAt: new Date().toISOString(),
        },
        {
          assignmentId: "asg_2",
          careTeamId: "team_2",
          consentStatus: "pending",
          createdAt: new Date().toISOString(),
          facilityId: "facility_1",
          orgId: "org_1",
          status: "pending",
          updatedAt: new Date().toISOString(),
        },
      ]),
    ).toEqual({
      activeAssignmentCount: 1,
      hasActiveAssignments: true,
    });
  });

  it("builds generic care-team copy without a clinician", () => {
    expect(buildCareTeamConsentCopy({ careTeamId: "renal_north" })).toEqual({
      body: "You have been added to care team renal_north. Please review and approve this access request.",
      title: "Care team access request",
    });
  });

  it("builds clinician-specific copy when a clinician is supplied", () => {
    expect(
      buildCareTeamConsentCopy({
        careTeamId: "renal_north",
        clinicianPrincipalId: "pr_clinician_123",
      }),
    ).toEqual({
      body: "A clinician has been added to your care team and needs your approval.",
      title: "Care team update",
    });
  });
});
