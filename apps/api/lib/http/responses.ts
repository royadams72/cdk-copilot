// lib/http.ts
import { NextResponse } from "next/server";

export function ok<T>(data: T, init: number = 200) {
  return NextResponse.json({ ok: true, data }, { status: init });
}
export function bad(message: string, errors?: unknown, init: number = 400) {
  return NextResponse.json({ ok: false, message, errors }, { status: init });
}

export function badFromError(
  error: unknown,
  fallbackMessage = "Server error",
  fallbackStatus = 500,
) {
  const candidate = error as
    | {
        code?: string;
        errors?: unknown;
        message?: string;
        requestId?: string;
        status?: number;
      }
    | undefined;

  const status =
    typeof candidate?.status === "number" ? candidate.status : fallbackStatus;
  const message =
    typeof candidate?.message === "string" && candidate.message.trim()
      ? candidate.message
      : fallbackMessage;
  const errors =
    candidate?.errors ??
    (candidate?.code || candidate?.requestId
      ? {
          ...(candidate.code ? { code: candidate.code } : {}),
          ...(candidate.requestId ? { requestId: candidate.requestId } : {}),
        }
      : undefined);

  return bad(message, errors, status);
}
