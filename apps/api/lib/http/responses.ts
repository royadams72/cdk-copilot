// lib/http.ts
import { NextResponse } from "next/server";

export function ok<T>(data: T, init: number = 200) {
  return NextResponse.json({ ok: true, data }, { status: init });
}
export function bad(message: string, errors?: unknown, init: number = 400) {
  return NextResponse.json({ ok: false, message, errors }, { status: init });
}
