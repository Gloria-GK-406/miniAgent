import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const APPROVED_NAMES = [
  "@piaoxianguo/miniagent-core",
  "@piaoxianguo/miniagent-engine",
  "@piaoxianguo/miniagent-extensions",
];
const REGISTRY_ORIGIN = "https://registry.npmjs.org";
const REGISTRY_URL = `${REGISTRY_ORIGIN}/`;

function fail(message) {
  throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function credentialFreeEnvironment() {
  const env = {};
  for (const key of Object.keys(process.env)) {
    const lowerKey = key.toLowerCase();
    if (/(?:^|_)(?:auth|token|otp|password|credential|secret)(?:_|$)/.test(lowerKey)
      || (/^npm_config_/.test(lowerKey) && /(?:auth|token|otp|password|username|credential|secret|cert|key)/.test(lowerKey))) continue;
    env[key] = process.env[key];
  }
  return env;
}

async function assertNoProjectNpmConfig(candidateRoot) {
  const roots = new Set([
    process.cwd(),
    path.resolve(import.meta.dirname, ".."),
    candidateRoot,
  ]);
  for (const root of roots) {
    const npmrc = path.join(root, ".npmrc");
    try {
      await lstat(npmrc);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    fail(`Project npmrc is forbidden at the publication boundary: ${npmrc}`);
  }
}

function assertNoRegistryRedirect() {
  for (const key of Object.keys(process.env)) {
    if (/^npm_config_.*registry/i.test(key) && process.env[key] !== REGISTRY_URL) {
      fail(`Registry configuration override is forbidden: ${key}`);
    }
  }
}

function publicationEnvironment(userConfig, globalConfig) {
  const env = {};
  const credentialKey = /(?:^|_)(?:auth|token|otp|password|credential|secret)(?:_|$)/i;
  const requiredCredentialKeys = new Set([
    "NODE_AUTH_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_URL",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  ]);
  const ordinaryKeys = new Set([
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "CI",
  ]);
  for (const key of Object.keys(process.env)) {
    if (requiredCredentialKeys.has(key)) {
      env[key] = process.env[key];
      continue;
    }
    if (credentialKey.test(key)) continue;
    if (ordinaryKeys.has(key) || key.startsWith("GITHUB_") || key.startsWith("RUNNER_")
    ) {
      env[key] = process.env[key];
    }
  }
  env.NPM_CONFIG_USERCONFIG = userConfig;
  env.NPM_CONFIG_GLOBALCONFIG = globalConfig;
  env.NPM_CONFIG_REGISTRY = REGISTRY_URL;
  return env;
}

function assertPublicationCredentials({ dryRun, fixturePath }) {
  if (dryRun) return;
  const requiredKeys = [
    "NODE_AUTH_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_URL",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  ];
  const presentKeys = requiredKeys.filter((key) => typeof process.env[key] === "string" && process.env[key].length > 0);
  if (!fixturePath || presentKeys.length > 0) {
    const missingKeys = requiredKeys.filter((key) => !presentKeys.includes(key));
    if (missingKeys.length > 0) fail(`Required publication credentials are incomplete: ${missingKeys.join(", ")}`);
  }
}

async function createPublicationContext(npmCommandFixture) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "miniagent-publish-command-")));
  const userConfig = path.join(root, "user.npmrc");
  const globalConfig = path.join(root, "global.npmrc");
  await writeFile(userConfig, `registry=${REGISTRY_URL}\n//registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}\n`);
  await writeFile(globalConfig, "");
  return {
    root,
    env: publicationEnvironment(await realpath(userConfig), await realpath(globalConfig)),
    npmCommandFixture,
  };
}

async function loadCandidate(candidateArgument) {
  const manifestPath = await realpath(path.resolve(process.cwd(), candidateArgument));
  execFileSync(process.execPath, ["scripts/verify-release-packages.mjs", "--candidate", manifestPath, "--policy-only"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: "pipe",
    env: credentialFreeEnvironment(),
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.packages.map(({ name }) => name).join("\n") !== APPROVED_NAMES.join("\n")) {
    fail("Candidate contains an unapproved publication target");
  }
  const candidateRoot = path.dirname(manifestPath);
  const packages = [];
  for (const record of manifest.packages) {
    const archivePath = await realpath(path.resolve(candidateRoot, record.archive));
    if (!archivePath.startsWith(`${candidateRoot}${path.sep}`) || !archivePath.endsWith(".tgz")) {
      fail(`Unsafe accepted archive path for ${record.name}`);
    }
    packages.push({ ...record, archivePath });
  }
  return { ...manifest, packages };
}

function registryKey(record) {
  return `${record.name}@${record.version}`;
}

function expectedVersion(manifest, record, body) {
  if (!body || typeof body !== "object") fail(`Malformed Registry response for ${record.name}`);
  if (body.name !== record.name || body.version !== record.version
    || body.dist?.integrity !== record.integrity
    || body.miniagentRelease?.sourceRevision !== manifest.sourceRevision
    || body.miniagentRelease?.candidateId !== manifest.candidateId) {
    fail(`Registry identity mismatch for ${record.name}`);
  }
}

async function createLookup(fixturePath) {
  if (fixturePath) {
    const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), fixturePath), "utf8"));
    const positions = new Map();
    return async (record) => {
      const key = registryKey(record);
      const configured = fixture.responses?.[key];
      if (configured === undefined) fail(`Missing Registry fixture response for ${key}`);
      const sequence = Array.isArray(configured) ? configured : [configured];
      const position = positions.get(key) ?? 0;
      positions.set(key, position + 1);
      const response = sequence[Math.min(position, sequence.length - 1)];
      return response;
    };
  }
  return async (record) => {
    const encodedName = encodeURIComponent(record.name).replace(/^%40/, "@");
    const url = `${REGISTRY_ORIGIN}/${encodedName}/${encodeURIComponent(record.version)}`;
    let lastStatus;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response;
      try {
        response = await fetch(url, {
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        if (attempt < 2) continue;
        fail(`Indeterminate Registry network response for ${record.name}`);
      }
      lastStatus = response.status;
      if (response.status === 404) return { status: 404 };
      if (response.status === 200) {
        let body;
        try {
          body = await response.json();
        } catch {
          fail(`Malformed Registry JSON for ${record.name}`);
        }
        return { status: 200, body };
      }
      if (response.status !== 429 && response.status < 500) break;
    }
    fail(`Indeterminate Registry status ${lastStatus} for ${record.name}`);
  };
}

async function classify(manifest, lookup, record) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await lookup(record);
    if (response?.status === 404) return "absent";
    if (response?.status === 200) {
      expectedVersion(manifest, record, response.body);
      return "present";
    }
    if ((response?.error || response?.status === 429 || response?.status >= 500) && attempt < 2) continue;
    fail(`Indeterminate Registry response for ${record.name}`);
  }
  fail(`Indeterminate Registry response for ${record.name}`);
}

function commandLine(record) {
  return [
    "npm", "publish", record.archivePath, "--provenance", "--access", "public", "--registry", REGISTRY_URL,
  ];
}

async function waitForExpected(manifest, lookup, record) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = await classify(manifest, lookup, record);
    if (state === "present") return;
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  fail(`Published package did not become authoritatively visible: ${record.name}`);
}

async function publishOne(manifest, lookup, record, { dryRun, commandFixture, publicationContext }) {
  const command = commandLine(record);
  console.log(command.join(" "));
  if (dryRun) return;
  let ambiguous = false;
  try {
    if (commandFixture) {
      const outcome = commandFixture[record.name] ?? "success";
      if (outcome === "ambiguous") throw new Error("simulated ambiguous outcome");
      if (outcome !== "success") fail(`Injected publication failure for ${record.name}`);
    } else {
      const executable = publicationContext.npmCommandFixture ? process.execPath : command[0];
      const arguments_ = publicationContext.npmCommandFixture
        ? [publicationContext.npmCommandFixture, ...command.slice(1)]
        : command.slice(1);
      execFileSync(executable, arguments_, {
        cwd: publicationContext.root,
        stdio: "inherit",
        env: publicationContext.env,
      });
    }
  } catch (error) {
    if (publicationContext.npmCommandFixture) throw error;
    ambiguous = true;
  }
  try {
    await waitForExpected(manifest, lookup, record);
  } catch (error) {
    if (ambiguous) fail(`Ambiguous publication was not confirmed for ${record.name}`);
    throw error;
  }
}

async function main() {
  const candidateArgument = argument("--candidate");
  if (!candidateArgument) fail("Missing --candidate manifest path");
  const dryRun = process.argv.includes("--dry-run");
  const fixturePath = argument("--registry-fixture");
  const commandFixturePath = argument("--command-fixture");
  const npmCommandFixtureArgument = argument("--npm-command-fixture");
  const npmCommandFixture = npmCommandFixtureArgument
    ? await realpath(path.resolve(process.cwd(), npmCommandFixtureArgument))
    : undefined;
  const commandFixture = commandFixturePath
    ? JSON.parse(await readFile(path.resolve(process.cwd(), commandFixturePath), "utf8"))
    : undefined;
  if (!dryRun && fixturePath && !commandFixture && !npmCommandFixture) {
    fail("Fixture publication requires --dry-run, --command-fixture, or --npm-command-fixture");
  }
  const manifest = await loadCandidate(candidateArgument);
  assertPublicationCredentials({ dryRun, fixturePath });
  assertNoRegistryRedirect();
  await assertNoProjectNpmConfig(path.dirname(await realpath(path.resolve(process.cwd(), candidateArgument))));
  const publicationContext = await createPublicationContext(npmCommandFixture);
  try {
    const lookup = await createLookup(fixturePath);
    const initialStates = new Map();
    for (const record of manifest.packages) initialStates.set(record.name, await classify(manifest, lookup, record));
    if (initialStates.get(APPROVED_NAMES[0]) === "absent"
      && APPROVED_NAMES.slice(1).some((name) => initialStates.get(name) === "present")) {
      fail("Invalid partial release: dependent exists without core");
    }
    for (const record of manifest.packages) {
      if (initialStates.get(record.name) === "present") continue;
      if (record.name !== APPROVED_NAMES[0] && initialStates.get(APPROVED_NAMES[0]) !== "present" && dryRun) {
        initialStates.set(APPROVED_NAMES[0], "present");
      }
      if (record.name !== APPROVED_NAMES[0] && initialStates.get(APPROVED_NAMES[0]) !== "present") {
        fail(`Core is not available before ${record.name}`);
      }
      await publishOne(manifest, lookup, record, { dryRun, commandFixture, publicationContext });
      initialStates.set(record.name, "present");
    }
  } finally {
    await rm(publicationContext.root, { recursive: true, force: true });
  }
}

await main();
