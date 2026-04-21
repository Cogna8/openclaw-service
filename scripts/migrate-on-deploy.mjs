#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;

if (env !== "production") {
  console.log(
    `[migrate-on-deploy] skipping prisma migrate deploy (VERCEL_ENV=${env ?? "unset"})`,
  );
  process.exit(0);
}

console.log(
  "[migrate-on-deploy] production deploy detected; running prisma migrate deploy",
);

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  cmd,
  ["prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
