import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "cogna8-openclaw-eval-service",
    status: "ok",
  });
}
