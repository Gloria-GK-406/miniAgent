import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MARKER_PATH = "scripts/release-intent-0.9.1.json";
const EXPECTED_MARKER = {
  version: "0.9.1",
  packages: [
    "@piaoxianguo/miniagent-core",
    "@piaoxianguo/miniagent-engine",
    "@piaoxianguo/miniagent-extensions",
  ],
};

function fail(message) {
  throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function decision(eligible, reason) {
  console.log(JSON.stringify({ eligible, reason }));
}

async function main() {
  const event = argument("--event");
  const ref = argument("--ref");
  const sha = argument("--sha");
  if (event !== "push" || ref !== "refs/heads/master") {
    decision(false, "not-master-push");
    return;
  }
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) fail("Exact 40-character --sha is required");
  let shallow;
  let head;
  try {
    shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
    head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    fail("Complete repository history is unavailable");
  }
  if (shallow !== "false") fail("Complete repository history is required");
  if (head !== sha) fail("Release SHA must equal the checked-out HEAD");
  const marker = JSON.parse(await readFile(path.resolve(process.cwd(), MARKER_PATH), "utf8"));
  if (JSON.stringify(marker) !== JSON.stringify(EXPECTED_MARKER)) fail("Release intent marker is not exact");
  let additions;
  try {
    execFileSync("git", ["rev-list", "--objects", "--missing=error", sha], { stdio: "pipe" });
    additions = execFileSync("git", [
      "log", "--full-history", "--diff-filter=A", "--format=%H", sha, "--", MARKER_PATH,
    ], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    fail("Complete release intent ancestry is unavailable");
  }
  if (additions.length !== 1 || additions[0] !== sha) {
    decision(false, "release-intent-not-unique-current-addition");
    return;
  }
  decision(true, "unique-release-intent-addition");
}

await main();
