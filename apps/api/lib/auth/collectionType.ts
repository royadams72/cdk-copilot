export type CollectionType = "oauth_code" | "email_verify" | "password_reset";

export enum COLLECTION_TYPE {
  OauthCode = "oauth_code",
  EmailVerify = "email_verify",
  PasswordReset = "password_reset",
  Refresh = "refresh",
}
