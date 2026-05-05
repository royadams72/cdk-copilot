export function getJwtSecretValue() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}

export function getJwtSecretBytes() {
  return new TextEncoder().encode(getJwtSecretValue());
}
