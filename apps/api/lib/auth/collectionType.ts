export type CollectionType =
  | "oauth_code"
  | "email_verify"
  | "password_reset"
  | "portal_login_code";

export enum COLLECTION_TYPE {
  OauthCode = "oauth_code",
  EmailVerify = "email_verify",
  PasswordReset = "password_reset",
  PortalLoginCode = "portal_login_code",
  Refresh = "refresh",
}
