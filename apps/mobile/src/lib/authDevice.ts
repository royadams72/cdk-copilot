import { secureStorage } from "./secureStorage";

const AUTH_DEVICE_ID_KEY = "ckd_auth_device_id";

function makeDeviceId() {
  return [
    "dev",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
    Math.random().toString(36).slice(2, 10),
  ].join("_");
}

export async function getOrCreateAuthDeviceId() {
  const existing = await secureStorage.getItem(AUTH_DEVICE_ID_KEY);
  if (existing) return existing;

  const next = makeDeviceId();
  await secureStorage.setItem(AUTH_DEVICE_ID_KEY, next);
  return next;
}
