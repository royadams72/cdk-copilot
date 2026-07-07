export type MembershipLifecycleStatus =
  | "active"
  | "endingSoon"
  | "expired"
  | "inactive"
  | "ended"
  | "pending"
  | "unassigned";

export type MembershipLifecycleSnapshot = {
  computedStatus: MembershipLifecycleStatus;
  daysRemaining: number | null;
  endsAt: string | null;
  status: string | null;
};
