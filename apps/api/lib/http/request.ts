// lib/request.ts
import { randomUUID } from "crypto";
export function makeRandomId() {
  return randomUUID();
}
