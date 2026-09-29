import { notImplemented } from "@/lib/api/errors";
import { route } from "@/lib/api/route";

// API_SPEC §8.2
export const maxDuration = 60;

// Q1 POST /api/ask 🔑 — API_SPEC §4
export const POST = route({ access: "member", questionRequest: true, idempotent: true }, async () =>
  notImplemented("WU-109"),
);
