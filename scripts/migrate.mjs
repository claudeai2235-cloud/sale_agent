// Applies database migrations during deploy (skips when DATABASE_URL is not set, e.g. local `next build`).
import { execSync } from "node:child_process";
if (!process.env.DATABASE_URL) {
  console.log("[migrate] DATABASE_URL not set — skipping migrations");
} else {
  execSync("npx drizzle-kit migrate", { stdio: "inherit" });
}
