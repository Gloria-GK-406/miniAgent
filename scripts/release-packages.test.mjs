import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const candidateRoot = path.join(repositoryRoot, ".release", "candidate");
const EXPECTED_REPOSITORY = {
  type: "git",
  url: "git+https://github.com/Gloria-GK-406/miniAgent.git",
};
const APPROVED_ACTION_PINS = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/upload-artifact", "ea165f8d65b6e75b540449e92b4886f43607fa02"],
  ["actions/download-artifact", "d3f86a106a0bac45b974a628896c90dbdf5c8093"],
]);
const FIXTURE_LEAF_CERTIFICATE = "MIIC9zCCAd+gAwIBAgIJANrmfEvdRE1XMA0GCSqGSIb3DQEBCwUAMCgxJjAkBgNVBAMMHW1pbmlhZ2VudC1zaWdzdG9yZS1maXh0dXJlLWNhMCAXDTI2MDgwOTE1MTM1NloYDzIxMjYwNzE2MTUxMzU2WjAqMSgwJgYDVQQDDB9taW5pYWdlbnQtc2lnc3RvcmUtZml4dHVyZS1sZWFmMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwzuaWaNeq5HUmq6O5/Uy8pgAmAQYNHztHVZ1+iS8cH60WlGu5fPJTjzEUEMsx9o2VIKrhdgkfDRkoq0bkF6mJWH68vD0BZv39LK8DPk4eAlEINr/l0OeXIpdqsKnqwLSs2DtCT0ftcCHGBQ8oCnGSJ/zpW24wiJ8y4lJcDPABDfQVkti9NL9rjjPVxM/Dws0aV7f3A0OuZqPYqW6ip5JMTUMxN3sW7RBWK7PuTHzpza87jMijijbSiI1WXcPUerxtYkaJVDorgfKn+A4WhV7ihOvGCE54z8eWkn4pyhH1gY+UfUKHPCJOw0qNyIMr6WHQjujy/aSJgiunx+0ruZTKQIDAQABoyAwHjAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOCAQEAfVjVu8aIGYBbUTftYOtp5KpGT90Lw9sa2g74Igw69sKmd8ZrqUZlKyofL0NtYulY6ifEXGBHO+GLzSTdsph1nOy6w+0h04PQskYBAy19d3EiQ8MGNQD3joreQsNr4a84bmmM2Wt4srN17d8SQDpbSiFwp1F0S5A0wYYYuRXIRnk+vZEuICMUNsDiJghOtTpzRKZexpCspYHN74l8x/ESFsDyOHOK1Qdt+WaDUwXoPJh5uJd8oMwWX51H8piEGtBbwKS/UV5jj1KhlRz10/S76JjNvrtGu09cE0RfAFDwS/BwykT0PC5j1JMGsOGwHkiFWRdhoW6/J8Y6SM6Kvei6pQ==";
const FIXTURE_ISSUER_CERTIFICATE = "MIIC+DCCAeCgAwIBAgIJAPBAzFMJaWHjMA0GCSqGSIb3DQEBCwUAMCgxJjAkBgNVBAMMHW1pbmlhZ2VudC1zaWdzdG9yZS1maXh0dXJlLWNhMCAXDTI2MDgwOTE1MTM1NloYDzIxMjYwNzE2MTUxMzU2WjAoMSYwJAYDVQQDDB1taW5pYWdlbnQtc2lnc3RvcmUtZml4dHVyZS1jYTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAL6b98OtncgzzDg6TUZuzCSRY1mLKX5pskLwppyKwZn3fQPeTHI/yI4mY8tD9RUZ8DyQloCP8dU+uUQodRh0y8zE8+BgcOg1vTVpFDpGsMVrYeN8Z7a+0I0soFz25xV1wn0Z34YuDx2wbGGbAGame7GTmpSD9r6bqcVMj8Dzn2k8w/YKa3e7V8755uxctOc3sDHkIirOOIl9IAGRM1YCDGAKCWnibDRfblnpJpXLe6++R+RlCBL+qykzjux0eSqZcK5TndhmiJt4IkOADrdfLBKDxYNooUV0OCJQx7yhZafa4Pb++op0991buuXxog0Wv0BEcMMS9idGi901b54d9McCAwEAAaMjMCEwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQELBQADggEBAF4aGdncQnYgxRSvfQ5/afEnkXv0TNKFQqZFyYjNFhXHY7KlSqnts+tzFBBhrIIGJL+OhqDDqXNqVQ73QeBjbhPIOa8GDsBpS00vDFAUXD2rPH6q0PC3G5w2t0nE3ntdLreziNhocNJp2G71LOAmiGzp6bm3Cg4ZeeWfu35X2dOy2UrROXHE0y4NnVugTiNW7wb2aEMXaHD3FFVcc6Ih/BwIwmjOdGU01GZI38SySUoqzQLpRKAoRH9IIU5biHpJBnlmnPfjQBmmaeqtK9dZuMtmdPW5lGAaQpBd35fguIwIvINPFjVHPQtPVg3HaHuwSBCDFho9aeGI0nDO4wFY0Wc=";

function verify(candidate, ...extraArguments) {
  return spawnSync(
    process.execPath,
    ["scripts/verify-release-packages.mjs", "--candidate", candidate, "--policy-only", ...extraArguments],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

function assertApprovedExternalActionReferences(references) {
  for (const reference of references) {
    const match = /^([^/]+\/[^@]+)@([0-9a-f]{40})$/.exec(reference);
    assert.ok(match, `external action is not pinned to a full lowercase commit SHA: ${reference}`);
    const [, action, revision] = match;
    assert.equal(APPROVED_ACTION_PINS.get(action), revision, `external action is not approved: ${reference}`);
  }
}

async function withCandidateCopy(change, assertion) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-release-test-"));
  const copiedCandidate = path.join(temporaryRoot, "candidate");
  try {
    await cp(candidateRoot, copiedCandidate, { recursive: true });
    await change(copiedCandidate);
    assertion(verify(path.join(copiedCandidate, "manifest.json")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

test("generates one deterministic, isolated three-package candidate", {
  skip: process.argv.includes("--skip-generation"),
}, async () => {
  execFileSync(process.execPath, ["scripts/build-release-packages.mjs", "--verify-determinism"], {
    cwd: repositoryRoot,
    stdio: "pipe",
  });

  const manifest = JSON.parse(
    await readFile(path.join(candidateRoot, "manifest.json"), "utf8"),
  );
  const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assert.deepEqual(rootPackage.repository, EXPECTED_REPOSITORY);
  assert.equal(manifest.version, "0.9.0");
  assert.equal(manifest.packages.length, 3);
  assert.deepEqual(
    manifest.packages.map(({ name }) => name),
    [
      "@piaoxianguo/miniagent-core",
      "@piaoxianguo/miniagent-engine",
      "@piaoxianguo/miniagent-extensions",
    ],
  );
  assert.equal(new Set(manifest.packages.map(({ candidateId }) => candidateId)).size, 1);
  assert.equal(manifest.packages[0].candidateId, manifest.candidateId);

  for (const packageRecord of manifest.packages) {
    const packageRoot = path.join(candidateRoot, packageRecord.directory);
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(packageJson.version, "0.9.0");
    assert.equal(packageJson.private, undefined);
    assert.equal(packageJson.publishConfig.access, "public");
    assert.deepEqual(packageJson.repository, EXPECTED_REPOSITORY);
    const archivedPackageJson = JSON.parse(execFileSync("tar", [
      "-xOzf", path.join(candidateRoot, packageRecord.archive), "package/package.json",
    ], { encoding: "utf8" }));
    assert.deepEqual(archivedPackageJson.repository, EXPECTED_REPOSITORY);
    assert.deepEqual(packageJson.miniagentRelease, {
      sourceRevision: manifest.sourceRevision,
      candidateId: manifest.candidateId,
    });
    for (const targets of Object.values(packageJson.exports)) {
      for (const target of Object.values(targets)) {
        assert.equal((await stat(path.join(packageRoot, target))).isFile(), true);
      }
    }
    assert.match(packageRecord.integrity, /^sha512-/);
    assert.equal((await stat(path.join(candidateRoot, packageRecord.archive))).isFile(), true);
  }

  const enginePackage = JSON.parse(
    await readFile(path.join(candidateRoot, "packages", "engine", "package.json"), "utf8"),
  );
  const extensionsPackage = JSON.parse(
    await readFile(path.join(candidateRoot, "packages", "extensions", "package.json"), "utf8"),
  );
  assert.equal(enginePackage.dependencies["@piaoxianguo/miniagent-core"], "0.9.0");
  assert.equal(extensionsPackage.dependencies["@piaoxianguo/miniagent-core"], "0.9.0");
  assert.equal(enginePackage.dependencies["@piaoxianguo/miniagent-extensions"], undefined);
  assert.equal(extensionsPackage.dependencies["@piaoxianguo/miniagent-engine"], undefined);

  for (const layer of ["engine", "extensions"]) {
    const distRoot = path.join(candidateRoot, "packages", layer, "dist");
    const pending = [distRoot];
    while (pending.length > 0) {
      const directory = pending.pop();
      assert.ok(directory);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          pending.push(entryPath);
        } else if (/\.(?:js|d\.ts|map)$/.test(entry.name)) {
          const content = await readFile(entryPath, "utf8");
          assert.doesNotMatch(content, /(?:\.\.\/)+core(?:\/index\.js)?/);
        }
      }
    }
  }
});

test("isolates every generator npm subprocess from caller and project credentials", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-generator-env-test-"));
  try {
    const fixtureRoot = path.join(temporaryRoot, "repository");
    const binRoot = path.join(temporaryRoot, "bin");
    const wrapperPath = path.join(binRoot, "npm");
    const hostileUserConfig = path.join(temporaryRoot, "hostile-user.npmrc");
    const logPath = path.join(temporaryRoot, "npm-calls.log");
    await mkdir(path.join(fixtureRoot, "scripts", "release"), { recursive: true });
    await mkdir(binRoot);
    await cp(path.join(repositoryRoot, "scripts", "build-release-packages.mjs"), path.join(fixtureRoot, "scripts", "build-release-packages.mjs"));
    await cp(path.join(repositoryRoot, "scripts", "release", "package-contract.mjs"), path.join(fixtureRoot, "scripts", "release", "package-contract.mjs"));
    await cp(path.join(repositoryRoot, "dist"), path.join(fixtureRoot, "dist"), { recursive: true });
    await cp(path.join(repositoryRoot, "LICENSE"), path.join(fixtureRoot, "LICENSE"));
    await cp(path.join(repositoryRoot, "README.md"), path.join(fixtureRoot, "README.md"));
    await cp(path.join(repositoryRoot, "package.json"), path.join(fixtureRoot, "package.json"));
    await writeFile(hostileUserConfig, "//registry.npmjs.org/:_authToken=must-not-be-read\n");
    await writeFile(path.join(fixtureRoot, ".npmrc"), "registry=https://generator-project.invalid/\n//generator-project.invalid/:_authToken=must-not-be-read\n");
    await writeFile(wrapperPath, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const forbidden = Object.keys(process.env).filter((key) => /(?:^|_)(?:auth|token|otp|password|credential|secret)(?:_|$)/i.test(key) || /^npm_config_.*(?:auth|token|otp|password|credential|secret|cert|key)/i.test(key));
const userConfig = process.env.NPM_CONFIG_USERCONFIG ?? process.env.npm_config_userconfig;
const probe = spawnSync(process.env.MINIAGENT_REAL_NPM, ["config", "get", "registry"], { cwd: process.cwd(), encoding: "utf8", env: process.env });
if (forbidden.length > 0 || !userConfig || readFileSync(userConfig, "utf8") !== "" || probe.stdout.trim() === "https://generator-project.invalid/" || process.env.npm_config_fetch_retries !== "7") process.exit(95);
appendFileSync(process.env.MINIAGENT_NPM_TEST_LOG, process.argv.slice(2).join(" ") + "\\n");
const result = spawnSync(process.env.MINIAGENT_REAL_NPM, process.argv.slice(2), { stdio: "inherit", env: process.env });
process.exit(result.status ?? 98);
`);
    await chmod(wrapperPath, 0o755);
    const realNpm = execFileSync("which", ["npm"], { encoding: "utf8" }).trim();
    const gitDirectory = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    const hostileEnvironment = {
      ...process.env,
      GIT_DIR: gitDirectory,
      GIT_WORK_TREE: fixtureRoot,
      PATH: `${binRoot}${path.delimiter}${process.env.PATH}`,
      MINIAGENT_REAL_NPM: realNpm,
      MINIAGENT_NPM_TEST_LOG: logPath,
      NODE_AUTH_TOKEN: "hostile-node-token",
      NPM_TOKEN: "hostile-npm-token",
      npm_config__authToken: "hostile-config-token",
      npm_config_otp: "hostile-one-time-password",
      npm_config_fetch_retries: "7",
      NPM_CONFIG_USERCONFIG: hostileUserConfig,
    };
    const result = spawnSync(process.execPath, ["scripts/build-release-packages.mjs"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: hostileEnvironment,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const calls = (await readFile(logPath, "utf8")).trim().split("\n");
    assert.equal(calls.filter((call) => call === "--version").length, 1);
    assert.equal(calls.filter((call) => call.startsWith("pack ")).length, 3);
    assert.equal((await stat(path.join(fixtureRoot, ".release", "candidate", "manifest.json"))).isFile(), true);
    const fixturePackagePath = path.join(fixtureRoot, "package.json");
    const fixturePackage = JSON.parse(await readFile(fixturePackagePath, "utf8"));
    fixturePackage.repository.url = "git+https://github.com/gloria-gk-406/miniagent.git";
    await writeFile(fixturePackagePath, `${JSON.stringify(fixturePackage, null, 2)}\n`);
    const wrongRoot = spawnSync(process.execPath, ["scripts/build-release-packages.mjs"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: hostileEnvironment,
    });
    assert.notEqual(wrongRoot.status, 0, "wrong root repository unexpectedly passed");
    assert.match(wrongRoot.stderr, /root repository/i);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("accepts only the exact frozen candidate package policy", async () => {
  const accepted = verify(path.join(candidateRoot, "manifest.json"));
  assert.equal(accepted.status, 0, accepted.stderr);

  const cases = [
    ["changed archive", async (root) => {
      await appendFile(path.join(root, "archives", "piaoxianguo-miniagent-core-0.9.0.tgz"), "changed");
    }, /integrity/i],
    ["invalid inventory", async (root) => {
      const manifestPath = path.join(root, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.packages[0].inventory.push("test/fixture.js");
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }, /inventory/i],
    ["missing export", async (root) => {
      const packagePath = path.join(root, "packages", "engine", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      packageJson.exports["./missing"] = { types: "./dist/missing.d.ts", import: "./dist/missing.js" };
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /exports/i],
    ["wrong dependency", async (root) => {
      const packagePath = path.join(root, "packages", "engine", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      packageJson.dependencies["@piaoxianguo/miniagent-core"] = "^0.9.0";
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /dependencies/i],
    ["horizontal MiniAgent dependency", async (root) => {
      const packagePath = path.join(root, "packages", "engine", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      packageJson.dependencies["@piaoxianguo/miniagent-extensions"] = "0.9.0";
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /dependencies/i],
    ["peer leakage", async (root) => {
      const packagePath = path.join(root, "packages", "extensions", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      packageJson.peerDependencies = { zod: "*" };
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /peer/i],
    ["missing repository", async (root) => {
      const packagePath = path.join(root, "packages", "core", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      delete packageJson.repository;
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /repository|manifest/i],
    ["wrong repository type", async (root) => {
      const packagePath = path.join(root, "packages", "core", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      packageJson.repository.type = "github";
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /repository|manifest/i],
    ["wrong repository URL", async (root) => {
      const packagePath = path.join(root, "packages", "core", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      packageJson.repository.url = "git+https://github.com/foreign/miniAgent.git";
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /repository|manifest/i],
    ["wrong repository casing", async (root) => {
      const packagePath = path.join(root, "packages", "core", "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      packageJson.repository.url = "git+https://github.com/gloria-gk-406/miniagent.git";
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }, /repository|manifest/i],
    ["wrong archived repository", async (root) => {
      const manifestPath = path.join(root, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const record = manifest.packages[0];
      const archivePath = path.join(root, record.archive);
      const extractionRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-repository-archive-"));
      try {
        execFileSync("tar", ["-xzf", archivePath, "-C", extractionRoot]);
        const packagePath = path.join(extractionRoot, "package", "package.json");
        const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
        packageJson.repository.url = "git+https://github.com/foreign/miniAgent.git";
        await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
        const archiveEntries = (await readdir(path.join(extractionRoot, "package"))).map((entry) => `package/${entry}`);
        execFileSync("tar", ["-czf", archivePath, "-C", extractionRoot, ...archiveEntries]);
        record.integrity = `sha512-${createHash("sha512").update(await readFile(archivePath)).digest("base64")}`;
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      } finally {
        await rm(extractionRoot, { recursive: true, force: true });
      }
    }, /repository|manifest/i],
    ["escaping reference", async (root) => {
      await writeFile(path.join(root, "packages", "extensions", "dist", "escape.js"), "export * from '../../../core/index.js';\n");
    }, /reference|inventory/i],
    ["unaccepted candidate", async (root) => {
      const manifestPath = path.join(root, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.candidateId = `sha256:${"0".repeat(64)}`;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }, /candidate/i],
    ["symlinked package root escapes the candidate", async (root) => {
      const packageRoot = path.join(root, "packages", "core");
      await rm(packageRoot, { recursive: true });
      await symlink(path.join(candidateRoot, "packages", "core"), packageRoot, "dir");
    }, /symlink|canonical|contain/i],
    ["symlinked archive escapes the candidate", async (root) => {
      const archivePath = path.join(root, "archives", "piaoxianguo-miniagent-core-0.9.0.tgz");
      await rm(archivePath);
      await symlink(path.join(candidateRoot, "archives", "piaoxianguo-miniagent-core-0.9.0.tgz"), archivePath);
    }, /symlink|canonical|contain/i],
  ];

  for (const [name, change, expected] of cases) {
    await withCandidateCopy(change, (rejected) => {
      assert.notEqual(rejected.status, 0, `${name} unexpectedly passed`);
      assert.match(`${rejected.stdout}\n${rejected.stderr}`, expected);
    });
  }
});

test("isolates every npm subprocess from hostile caller credentials", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-npm-env-test-"));
  try {
    const binRoot = path.join(temporaryRoot, "bin");
    const wrapperPath = path.join(binRoot, "npm");
    const hostileUserConfig = path.join(temporaryRoot, "hostile.npmrc");
    const logPath = path.join(temporaryRoot, "npm-calls.log");
    await mkdir(binRoot);
    await writeFile(hostileUserConfig, "//registry.npmjs.org/:_authToken=must-not-be-read\n");
    await writeFile(wrapperPath, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const forbidden = Object.keys(process.env).filter((key) => /(?:^|_)(?:auth|token|otp|password|credential|secret)(?:_|$)/i.test(key) || /^npm_config_.*(?:auth|token|otp|password|credential|secret|cert|key)/i.test(key));
const userConfig = process.env.NPM_CONFIG_USERCONFIG ?? process.env.npm_config_userconfig;
if (forbidden.length > 0 || !userConfig || readFileSync(userConfig, "utf8") !== "" || process.env.npm_config_fetch_retries !== "7") process.exit(97);
appendFileSync(process.env.MINIAGENT_NPM_TEST_LOG, "npm\\n");
const result = spawnSync(process.env.MINIAGENT_REAL_NPM, process.argv.slice(2), { stdio: "inherit", env: process.env });
process.exit(result.status ?? 98);
`);
    await chmod(wrapperPath, 0o755);
    const realNpm = execFileSync("which", ["npm"], { encoding: "utf8" }).trim();
    const result = spawnSync(
      process.execPath,
      ["scripts/verify-release-packages.mjs", "--candidate", path.join(candidateRoot, "manifest.json")],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binRoot}${path.delimiter}${process.env.PATH}`,
          MINIAGENT_REAL_NPM: realNpm,
          MINIAGENT_NPM_TEST_LOG: logPath,
          NODE_AUTH_TOKEN: "hostile-node-token",
          NPM_TOKEN: "hostile-npm-token",
          GITHUB_TOKEN: "hostile-github-token",
          npm_config__authToken: "hostile-config-token",
          npm_config_otp: "hostile-one-time-password",
          npm_config_fetch_retries: "7",
          NPM_CONFIG_USERCONFIG: hostileUserConfig,
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok((await readFile(logPath, "utf8")).trim().split("\n").length >= 5);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("isolates npm pack from candidate-root project configuration", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-npm-project-test-"));
  const copiedCandidate = path.join(temporaryRoot, "candidate");
  try {
    const binRoot = path.join(temporaryRoot, "bin");
    const wrapperPath = path.join(binRoot, "npm");
    const logPath = path.join(temporaryRoot, "npm-calls.log");
    await cp(candidateRoot, copiedCandidate, { recursive: true });
    await writeFile(
      path.join(copiedCandidate, ".npmrc"),
      "registry=https://candidate-config.invalid/\n//candidate-config.invalid/:_authToken=must-not-be-read\n",
    );
    await mkdir(binRoot);
    await writeFile(wrapperPath, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const probe = spawnSync(process.env.MINIAGENT_REAL_NPM, ["config", "get", "registry"], { cwd: process.cwd(), encoding: "utf8", env: process.env });
if (probe.status !== 0 || probe.stdout.trim() === "https://candidate-config.invalid/") process.exit(96);
appendFileSync(process.env.MINIAGENT_NPM_TEST_LOG, "npm\\n");
const result = spawnSync(process.env.MINIAGENT_REAL_NPM, process.argv.slice(2), { stdio: "inherit", env: process.env });
process.exit(result.status ?? 98);
`);
    await chmod(wrapperPath, 0o755);
    const realNpm = execFileSync("which", ["npm"], { encoding: "utf8" }).trim();
    const result = spawnSync(
      process.execPath,
      ["scripts/verify-release-packages.mjs", "--candidate", path.join(copiedCandidate, "manifest.json"), "--policy-only"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binRoot}${path.delimiter}${process.env.PATH}`,
          MINIAGENT_REAL_NPM: realNpm,
          MINIAGENT_NPM_TEST_LOG: logPath,
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal((await readFile(logPath, "utf8")).trim().split("\n").length, 3);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("documents only the split 0.9 consumer routes in English and Chinese", async () => {
  const allowedImports = new Set([
    "@piaoxianguo/miniagent-core",
    "@piaoxianguo/miniagent-engine",
    "@piaoxianguo/miniagent-engine/anthropic",
    "@piaoxianguo/miniagent-engine/openai",
    "@piaoxianguo/miniagent-engine/openai-compatible",
    "@piaoxianguo/miniagent-engine/glm",
    "@piaoxianguo/miniagent-engine/glm-codeplan",
    "@piaoxianguo/miniagent-engine/nvidia",
    "@piaoxianguo/miniagent-extensions",
    "@piaoxianguo/miniagent-extensions/mcp",
    "@piaoxianguo/miniagent-extensions/skill",
    "@piaoxianguo/miniagent-extensions/subagent",
  ]);
  const documentation = ["README.md", "README_CN.md"];
  const toolsDocumentation = (await readdir(path.join(repositoryRoot, "document", "tools")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join("document", "tools", name));
  for (const relativePath of [...documentation, ...toolsDocumentation]) {
    const content = await readFile(path.join(repositoryRoot, relativePath), "utf8");
    assert.doesNotMatch(content, /from ["']@piaoxianguo\/miniagent(?:["'/])/);
    for (const match of content.matchAll(/from ["'](@piaoxianguo\/miniagent[^"']+)["']/g)) {
      assert.equal(allowedImports.has(match[1]), true, `${relativePath}: ${match[1]}`);
    }
  }
  for (const relativePath of documentation) {
    const content = await readFile(path.join(repositoryRoot, relativePath), "utf8");
    for (const packageName of [
      "@piaoxianguo/miniagent-core",
      "@piaoxianguo/miniagent-engine",
      "@piaoxianguo/miniagent-extensions",
    ]) assert.match(content, new RegExp(packageName));
    assert.doesNotMatch(content, /npm install @piaoxianguo\/miniagent(?:\s|$)/m);
    assert.match(content, relativePath.endsWith("_CN.md") ? /自动安装兼容的 core/ : /installs the compatible core package automatically/);
    assert.match(content, relativePath.endsWith("_CN.md") ? /不发布.*聚合包.*不发布 CLI 包/ : /does not publish.*aggregate package or a CLI package/);
  }
});

function registryVersion(manifest, record, changes = {}) {
  return {
    name: record.name,
    version: record.version,
    dist: { integrity: record.integrity },
    miniagentRelease: {
      sourceRevision: manifest.sourceRevision,
      candidateId: manifest.candidateId,
    },
    ...changes,
  };
}

async function runPublisher(fixture, ...arguments_) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-publish-test-"));
  try {
    const fixturePath = path.join(temporaryRoot, "registry.json");
    await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
    return spawnSync(process.execPath, [
      "scripts/publish-release-packages.mjs",
      "--candidate", path.join(candidateRoot, "manifest.json"),
      "--registry-fixture", fixturePath,
      ...arguments_,
    ], { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, NODE_AUTH_TOKEN: "" } });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function provenanceAttestation(manifest, record, changes = {}, bundleVersion = "0.3") {
  const digest = Buffer.from(record.integrity.slice("sha512-".length), "base64").toString("hex");
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: record.archive, digest: { sha512: digest } }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: {
          workflow: { repository: "https://github.com/Gloria-GK-406/miniAgent" },
        },
        resolvedDependencies: [{
          uri: "git+https://github.com/Gloria-GK-406/miniAgent@refs/heads/master",
          digest: { gitCommit: manifest.sourceRevision },
        }],
      },
    },
    ...changes,
  };
  const certificate = { rawBytes: FIXTURE_LEAF_CERTIFICATE };
  const issuerCertificate = { rawBytes: FIXTURE_ISSUER_CERTIFICATE };
  return {
    attestations: [{
      predicateType: "https://slsa.dev/provenance/v1",
      bundle: {
        mediaType: bundleVersion === "0.3"
          ? "application/vnd.dev.sigstore.bundle.v0.3+json"
          : `application/vnd.dev.sigstore.bundle+json;version=${bundleVersion}`,
        verificationMaterial: bundleVersion === "0.3"
          ? { certificate }
          : { x509CertificateChain: { certificates: [certificate, issuerCertificate] } },
        dsseEnvelope: {
          payloadType: "application/vnd.in-toto+json",
          payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
          signatures: [{ sig: Buffer.from("fixture-signature").toString("base64") }],
        },
      },
    }],
  };
}

async function runRegistrySmoke(manifest, fixture) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-registry-smoke-test-"));
  try {
    const fixturePath = path.join(temporaryRoot, "registry.json");
    await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
    return spawnSync(process.execPath, [
      "scripts/registry-smoke.mjs",
      "--candidate", path.join(candidateRoot, "manifest.json"),
      "--version", manifest.version,
      "--require-provenance",
      "--registry-fixture", fixturePath,
      "--metadata-only",
    ], { cwd: repositoryRoot, encoding: "utf8" });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

test("validates retained provenance attestation subject and source identity", async () => {
  const manifest = JSON.parse(await readFile(path.join(candidateRoot, "manifest.json"), "utf8"));
  const responses = {};
  for (const record of manifest.packages) {
    const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(record.name).replace(/^%40/, "@")}/${record.version}`;
    const attestationUrl = `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(`${record.name}@${record.version}`)}`;
    responses[metadataUrl] = { status: 200, body: registryVersion(manifest, record, {
      dist: { integrity: record.integrity, attestations: { url: attestationUrl } },
    }) };
    responses[attestationUrl] = { status: 200, body: provenanceAttestation(manifest, record) };
  }

  const accepted = await runRegistrySmoke(manifest, { responses });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(JSON.parse(accepted.stdout), {
    candidateId: manifest.candidateId,
    provenanceStatement: "identity-bound",
    cryptographicVerification: "not-performed",
  });

  for (const bundleVersion of ["0.1", "0.2"]) {
    const legacyResponses = structuredClone(responses);
    for (const record of manifest.packages) {
      const attestationUrl = `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(`${record.name}@${record.version}`)}`;
      legacyResponses[attestationUrl] = { status: 200, body: provenanceAttestation(manifest, record, {}, bundleVersion) };
    }
    const legacyAccepted = await runRegistrySmoke(manifest, { responses: legacyResponses });
    assert.equal(legacyAccepted.status, 0, `Sigstore ${bundleVersion}: ${legacyAccepted.stderr}`);
  }

  const firstRecord = manifest.packages[0];
  const firstAttestationUrl = `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(`${firstRecord.name}@${firstRecord.version}`)}`;
  const malformedPayload = provenanceAttestation(manifest, firstRecord);
  malformedPayload.attestations[0].bundle.dsseEnvelope.payload = "not-base64";
  const noncanonicalPayload = provenanceAttestation(manifest, firstRecord);
  noncanonicalPayload.attestations[0].bundle.dsseEnvelope.payload += "\n";
  const emptyVerificationMaterial = provenanceAttestation(manifest, firstRecord);
  emptyVerificationMaterial.attestations[0].bundle.verificationMaterial = {};
  const malformedVerificationMaterial = provenanceAttestation(manifest, firstRecord);
  malformedVerificationMaterial.attestations[0].bundle.verificationMaterial.certificate.rawBytes = "not-base64";
  const invalidCertificateMaterial = provenanceAttestation(manifest, firstRecord);
  invalidCertificateMaterial.attestations[0].bundle.verificationMaterial.certificate.rawBytes = "AQID";
  const wrongLegacyVerificationMaterial = provenanceAttestation(manifest, firstRecord, {}, "0.2");
  wrongLegacyVerificationMaterial.attestations[0].bundle.verificationMaterial = {
    certificate: { rawBytes: "AQID" },
  };
  const emptySignatures = provenanceAttestation(manifest, firstRecord);
  emptySignatures.attestations[0].bundle.dsseEnvelope.signatures = [];
  const emptySignatureValue = provenanceAttestation(manifest, firstRecord);
  emptySignatureValue.attestations[0].bundle.dsseEnvelope.signatures[0].sig = "";
  const malformedSignature = provenanceAttestation(manifest, firstRecord);
  malformedSignature.attestations[0].bundle.dsseEnvelope.signatures[0].sig = "not-base64";
  const noncanonicalSignature = provenanceAttestation(manifest, firstRecord);
  noncanonicalSignature.attestations[0].bundle.dsseEnvelope.signatures[0].sig = "AR==";
  const multipleSignatures = provenanceAttestation(manifest, firstRecord);
  multipleSignatures.attestations[0].bundle.dsseEnvelope.signatures.push({ sig: "AQID" });
  const multipleVerificationAlternatives = provenanceAttestation(manifest, firstRecord);
  multipleVerificationAlternatives.attestations[0].bundle.verificationMaterial.publicKey = { hint: "fixture-key" };
  const failures = [
    { status: 404 },
    { status: 200, body: { attestations: [] } },
    { status: 200, body: malformedPayload },
    { status: 200, body: noncanonicalPayload },
    { status: 200, body: emptyVerificationMaterial },
    { status: 200, body: malformedVerificationMaterial },
    { status: 200, body: invalidCertificateMaterial },
    { status: 200, body: wrongLegacyVerificationMaterial },
    { status: 200, body: emptySignatures },
    { status: 200, body: emptySignatureValue },
    { status: 200, body: malformedSignature },
    { status: 200, body: noncanonicalSignature },
    { status: 200, body: multipleSignatures },
    { status: 200, body: multipleVerificationAlternatives },
    { status: 200, body: provenanceAttestation(manifest, firstRecord, {
      subject: [{ name: firstRecord.archive, digest: { sha512: "0".repeat(128) } }],
    }) },
    { status: 200, body: provenanceAttestation(manifest, firstRecord, {
      predicate: { buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: { workflow: { repository: "https://github.com/foreign/project" } },
        resolvedDependencies: [{ uri: "git+https://github.com/foreign/project@refs/heads/master", digest: { gitCommit: manifest.sourceRevision } }],
      } },
    }) },
    { status: 200, body: provenanceAttestation(manifest, firstRecord, {
      predicate: { buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: { workflow: { repository: "https://github.com/Gloria-GK-406/miniAgent" } },
        resolvedDependencies: [{ uri: "git+https://github.com/Gloria-GK-406/miniAgent@refs/heads/master", digest: { gitCommit: "0".repeat(40) } }],
      } },
    }) },
  ];
  const duplicate = provenanceAttestation(manifest, firstRecord);
  duplicate.attestations.push(structuredClone(duplicate.attestations[0]));
  failures.push({ status: 200, body: duplicate });

  for (const failure of failures) {
    const rejected = await runRegistrySmoke(manifest, {
      responses: { ...responses, [firstAttestationUrl]: failure },
    });
    assert.notEqual(rejected.status, 0, `invalid attestation passed: ${rejected.stdout}`);
  }

  const firstMetadataUrl = `https://registry.npmjs.org/${encodeURIComponent(firstRecord.name).replace(/^%40/, "@")}/${firstRecord.version}`;
  const foreignUrl = await runRegistrySmoke(manifest, { responses: {
    ...responses,
    [firstMetadataUrl]: { status: 200, body: registryVersion(manifest, firstRecord, {
      dist: { integrity: firstRecord.integrity, attestations: { url: "https://attacker.invalid/attestations.json" } },
    }) },
  } });
  assert.notEqual(foreignUrl.status, 0, "foreign attestation URL unexpectedly passed");
});

test("isolates Registry consumer npm from every inherited config alias", async () => {
  const manifest = JSON.parse(await readFile(path.join(candidateRoot, "manifest.json"), "utf8"));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-registry-npm-boundary-"));
  try {
    const fixturePath = path.join(temporaryRoot, "registry.json");
    const wrapperPath = path.join(temporaryRoot, "npm-wrapper.mjs");
    const binRoot = path.join(temporaryRoot, "bin");
    const hostileConfig = path.join(temporaryRoot, "hostile.npmrc");
    const logPath = path.join(temporaryRoot, "npm-calls.jsonl");
    const responses = {};
    for (const record of manifest.packages) {
      const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(record.name).replace(/^%40/, "@")}/${record.version}`;
      const attestationUrl = `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(`${record.name}@${record.version}`)}`;
      responses[metadataUrl] = { status: 200, body: registryVersion(manifest, record, {
        dist: { integrity: record.integrity, attestations: { url: attestationUrl } },
      }) };
      responses[attestationUrl] = { status: 200, body: provenanceAttestation(manifest, record) };
    }
    await writeFile(fixturePath, `${JSON.stringify({ responses }, null, 2)}\n`);
    await writeFile(hostileConfig, "registry=https://registry.invalid/\n//registry.invalid/:_authToken=must-not-be-read\n");
    await mkdir(binRoot);
    await writeFile(wrapperPath, `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const npmKeys = Object.keys(process.env).filter((key) => /^npm_config_/i.test(key)).sort();
const expectedKeys = ["NPM_CONFIG_CACHE", "NPM_CONFIG_GLOBALCONFIG", "NPM_CONFIG_REGISTRY", "NPM_CONFIG_USERCONFIG"];
if (JSON.stringify(npmKeys) !== JSON.stringify(expectedKeys)) process.exit(91);
if (process.env.NPM_CONFIG_REGISTRY !== "https://registry.npmjs.org/") process.exit(92);
if (!process.env.NPM_CONFIG_USERCONFIG?.includes("miniagent-registry-config-") || !process.env.NPM_CONFIG_GLOBALCONFIG?.includes("miniagent-registry-config-") || !process.env.NPM_CONFIG_CACHE?.includes("miniagent-registry-config-")) process.exit(93);
if (readFileSync(process.env.NPM_CONFIG_USERCONFIG, "utf8") !== "" || readFileSync(process.env.NPM_CONFIG_GLOBALCONFIG, "utf8") !== "") process.exit(94);
if (Object.keys(process.env).some((key) => /(?:^|_)(?:auth|token|otp|password|credential|secret)(?:_|$)/i.test(key))) process.exit(95);
if (!process.cwd().includes("miniagent-registry-consumer-")) process.exit(96);
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ args, npmKeys, registry: process.env.NPM_CONFIG_REGISTRY }) + "\\n");
if (args[0] === "install") {
  if (args.slice(-2).join(" ") !== "@piaoxianguo/miniagent-engine@0.9.0 @piaoxianguo/miniagent-extensions@0.9.0") process.exit(97);
  const coreRoot = path.join(process.cwd(), "node_modules", "@piaoxianguo", "miniagent-core");
  mkdirSync(coreRoot, { recursive: true });
  writeFileSync(path.join(coreRoot, "package.json"), JSON.stringify({ name: "@piaoxianguo/miniagent-core", version: "0.9.0" }));
  process.exit(0);
}
if (args.join(" ") === "ls --all --json") {
  process.stdout.write(JSON.stringify({ dependencies: {
    "@piaoxianguo/miniagent-engine": { dependencies: { "@piaoxianguo/miniagent-core": { version: "0.9.0" } } },
    "@piaoxianguo/miniagent-extensions": { dependencies: { "@piaoxianguo/miniagent-core": { version: "0.9.0" } } },
  } }));
  process.exit(0);
}
process.exit(98);
`);
    await chmod(wrapperPath, 0o755);
    await symlink(wrapperPath, path.join(binRoot, "npm"));
    const result = spawnSync(process.execPath, [
      "scripts/registry-smoke.mjs",
      "--candidate", path.join(candidateRoot, "manifest.json"),
      "--version", manifest.version,
      "--require-provenance",
      "--registry-fixture", fixturePath,
      "--npm-command-fixture", wrapperPath,
    ], { cwd: repositoryRoot, encoding: "utf8", env: {
      ...process.env,
      PATH: `${binRoot}${path.delimiter}${process.env.PATH ?? ""}`,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
      npm_config_registry: "https://registry.invalid/",
      NPM_CONFIG_USERCONFIG: hostileConfig,
      npm_config_globalconfig: hostileConfig,
      NPM_CONFIG_CACHE: path.join(temporaryRoot, "hostile-cache"),
      npm_config_proxy: "https://proxy.invalid/",
      NPM_CONFIG_TAG: "hostile-tag",
      npm_config__authToken: "hostile-token",
      npm_config_otp: "hostile-otp",
      NODE_AUTH_TOKEN: "hostile-node-token",
      NPM_TOKEN: "hostile-npm-token",
    } });
    assert.equal(result.status, 0, result.stderr);
    const calls = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(calls.length, 2);
    assert.ok(calls.every(({ npmKeys, registry }) => npmKeys.length === 4 && registry === "https://registry.npmjs.org/"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("publishes only valid same-candidate partial states core-first", async () => {
  const manifest = JSON.parse(await readFile(path.join(candidateRoot, "manifest.json"), "utf8"));
  const keys = manifest.packages.map((record) => `${record.name}@${record.version}`);
  const present = Object.fromEntries(manifest.packages.map((record) => [
    `${record.name}@${record.version}`,
    { status: 200, body: registryVersion(manifest, record) },
  ]));
  const absent = Object.fromEntries(keys.map((key) => [key, { status: 404 }]));

  for (const [label, responses, expectedNames] of [
    ["none", absent, manifest.packages.map(({ name }) => name)],
    ["core", { ...absent, [keys[0]]: present[keys[0]] }, manifest.packages.slice(1).map(({ name }) => name)],
    ["core-engine", { ...absent, [keys[0]]: present[keys[0]], [keys[1]]: present[keys[1]] }, [manifest.packages[2].name]],
    ["core-extensions", { ...absent, [keys[0]]: present[keys[0]], [keys[2]]: present[keys[2]] }, [manifest.packages[1].name]],
    ["all", present, []],
  ]) {
    const result = await runPublisher({ responses }, "--dry-run");
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    const publishLines = result.stdout.split("\n").filter((line) => line.startsWith("npm publish "));
    assert.equal(publishLines.length, expectedNames.length, label);
    for (const [index, name] of expectedNames.entries()) {
      assert.match(publishLines[index], new RegExp(manifest.packages.find(({ name: packageName }) => packageName === name).archive.replaceAll("/", "\\/")));
      assert.match(publishLines[index], / --provenance --access public --registry https:\/\/registry\.npmjs\.org\/$/);
    }
  }

  for (const transient of [
    [{ status: 500 }, { status: 404 }],
    [{ error: "timeout" }, { status: 404 }],
  ]) {
    const result = await runPublisher({ responses: { ...absent, [keys[0]]: transient } }, "--dry-run");
    assert.equal(result.status, 0, result.stderr);
  }

  const invalidFixtures = [
    { responses: { ...absent, [keys[1]]: present[keys[1]] } },
    { responses: { ...present, [keys[2]]: { status: 200, body: registryVersion(manifest, manifest.packages[2], { dist: { integrity: "sha512-foreign" } }) } } },
    { responses: { ...present, [keys[1]]: { status: 200, body: registryVersion(manifest, manifest.packages[1], { miniagentRelease: { sourceRevision: manifest.sourceRevision, candidateId: `sha256:${"f".repeat(64)}` } }) } } },
    { responses: { ...present, [keys[1]]: { status: 200, body: registryVersion(manifest, manifest.packages[1], { miniagentRelease: { sourceRevision: "0".repeat(40), candidateId: manifest.candidateId } }) } } },
    { responses: { ...absent, [keys[0]]: { status: 401 } } },
    { responses: { ...absent, [keys[0]]: { status: 403 } } },
    { responses: { ...absent, [keys[0]]: { status: 429 } } },
    { responses: { ...absent, [keys[0]]: { status: 500 } } },
    { responses: { ...absent, [keys[0]]: { status: 200, body: null } } },
    { responses: { ...absent, [keys[0]]: { error: "timeout" } } },
  ];
  for (const fixture of invalidFixtures) {
    const result = await runPublisher(fixture, "--dry-run");
    assert.notEqual(result.status, 0, `invalid state passed: ${result.stdout}`);
  }
});

test("rejects a perturbed accepted tarball before publication planning", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-publish-perturb-"));
  const copiedCandidate = path.join(temporaryRoot, "candidate");
  try {
    await cp(candidateRoot, copiedCandidate, { recursive: true });
    await appendFile(path.join(copiedCandidate, "archives", "piaoxianguo-miniagent-core-0.9.0.tgz"), "perturbed");
    const result = spawnSync(process.execPath, [
      "scripts/publish-release-packages.mjs",
      "--candidate", path.join(copiedCandidate, "manifest.json"),
      "--registry-fixture", path.join(repositoryRoot, "scripts", "fixtures", "registry-none.json"),
      "--dry-run",
    ], { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, NODE_AUTH_TOKEN: "" } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /verify-release-packages|Command failed/i);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("waits for core visibility and resolves ambiguous publication by identity", async () => {
  const manifest = JSON.parse(await readFile(path.join(candidateRoot, "manifest.json"), "utf8"));
  const responses = {};
  const commands = {};
  for (const record of manifest.packages) {
    responses[`${record.name}@${record.version}`] = [
      { status: 404 },
      { status: 200, body: registryVersion(manifest, record) },
    ];
    commands[record.name] = record.name.endsWith("miniagent-core") ? "ambiguous" : "success";
  }
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-command-test-"));
  try {
    const commandPath = path.join(temporaryRoot, "commands.json");
    await writeFile(commandPath, `${JSON.stringify(commands, null, 2)}\n`);
    const result = await runPublisher({ responses }, "--command-fixture", commandPath);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.split("\n").filter((line) => line.startsWith("npm publish "));
    assert.equal(lines.length, 3);
    assert.match(lines[0], /miniagent-core-0\.9\.0\.tgz --provenance --access public --registry https:\/\/registry\.npmjs\.org\/$/);
    assert.match(lines[1], /miniagent-engine-0\.9\.0\.tgz --provenance --access public --registry https:\/\/registry\.npmjs\.org\/$/);
    assert.match(lines[2], /miniagent-extensions-0\.9\.0\.tgz --provenance --access public --registry https:\/\/registry\.npmjs\.org\/$/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("allows only the unique complete-history addition of the exact 0.9 release intent", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-release-eligibility-test-"));
  const shallowContainer = await mkdtemp(path.join(os.tmpdir(), "miniagent-release-eligibility-shallow-"));
  try {
    const markerPath = path.join(temporaryRoot, "scripts", "release-intent-0.9.0.json");
    const exactMarker = `${JSON.stringify({
      version: "0.9.0",
      packages: [
        "@piaoxianguo/miniagent-core",
        "@piaoxianguo/miniagent-engine",
        "@piaoxianguo/miniagent-extensions",
      ],
    }, null, 2)}\n`;
    await mkdir(path.dirname(markerPath), { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: temporaryRoot });
    execFileSync("git", ["config", "user.email", "release-fixture@example.invalid"], { cwd: temporaryRoot });
    execFileSync("git", ["config", "user.name", "Release Fixture"], { cwd: temporaryRoot });
    await writeFile(path.join(temporaryRoot, "base.txt"), "base\n");
    execFileSync("git", ["add", "base.txt"], { cwd: temporaryRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "base"], { cwd: temporaryRoot });
    await writeFile(markerPath, exactMarker);
    execFileSync("git", ["add", "scripts/release-intent-0.9.0.json"], { cwd: temporaryRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "candidate A"], { cwd: temporaryRoot });
    const candidateA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: temporaryRoot, encoding: "utf8" }).trim();
    await writeFile(path.join(temporaryRoot, "later.txt"), "candidate B became ready first\n");
    execFileSync("git", ["add", "later.txt"], { cwd: temporaryRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "candidate B"], { cwd: temporaryRoot });
    const candidateB = execFileSync("git", ["rev-parse", "HEAD"], { cwd: temporaryRoot, encoding: "utf8" }).trim();
    await writeFile(markerPath, exactMarker.replace('"0.9.0"', '"0.9.1"'));
    execFileSync("git", ["add", "scripts/release-intent-0.9.0.json"], { cwd: temporaryRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "modified marker"], { cwd: temporaryRoot });
    const modifiedMarker = execFileSync("git", ["rev-parse", "HEAD"], { cwd: temporaryRoot, encoding: "utf8" }).trim();
    await rm(markerPath);
    execFileSync("git", ["add", "scripts/release-intent-0.9.0.json"], { cwd: temporaryRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "delete marker"], { cwd: temporaryRoot });
    const deletedMarker = execFileSync("git", ["rev-parse", "HEAD"], { cwd: temporaryRoot, encoding: "utf8" }).trim();
    await writeFile(markerPath, exactMarker);
    execFileSync("git", ["add", "scripts/release-intent-0.9.0.json"], { cwd: temporaryRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "candidate C re-add"], { cwd: temporaryRoot });
    const candidateC = execFileSync("git", ["rev-parse", "HEAD"], { cwd: temporaryRoot, encoding: "utf8" }).trim();

    const eligibility = (root, sha, event = "push", ref = "refs/heads/master") => spawnSync(process.execPath, [
      path.join(repositoryRoot, "scripts", "release-eligibility.mjs"),
      "--sha", sha,
      "--event", event,
      "--ref", ref,
    ], { cwd: root, encoding: "utf8" });
    const registryOperations = [];
    for (const [candidate, sha] of [["C", candidateC], ["B", candidateB], ["A", candidateA]]) {
      execFileSync("git", ["checkout", "--quiet", sha], { cwd: temporaryRoot });
      const result = eligibility(temporaryRoot, sha);
      if (result.status === 0 && JSON.parse(result.stdout).eligible) registryOperations.push(candidate);
    }
    assert.deepEqual(registryOperations, ["A"], "replayed or later candidate reached Registry operations");
    assert.deepEqual(JSON.parse(eligibility(temporaryRoot, candidateA).stdout), {
      eligible: true,
      reason: "unique-release-intent-addition",
    });
    assert.deepEqual(JSON.parse(eligibility(temporaryRoot, candidateA).stdout), {
      eligible: true,
      reason: "unique-release-intent-addition",
    });
    execFileSync("git", ["checkout", "--quiet", candidateB], { cwd: temporaryRoot });
    assert.deepEqual(JSON.parse(eligibility(temporaryRoot, candidateB).stdout), {
      eligible: false,
      reason: "release-intent-not-unique-current-addition",
    });
    execFileSync("git", ["checkout", "--quiet", modifiedMarker], { cwd: temporaryRoot });
    assert.notEqual(eligibility(temporaryRoot, modifiedMarker).status, 0, "modified marker unexpectedly eligible");
    execFileSync("git", ["checkout", "--quiet", deletedMarker], { cwd: temporaryRoot });
    assert.notEqual(eligibility(temporaryRoot, deletedMarker).status, 0, "deleted marker unexpectedly eligible");
    execFileSync("git", ["checkout", "--quiet", candidateA], { cwd: temporaryRoot });
    assert.equal(JSON.parse(eligibility(temporaryRoot, candidateA, "pull_request").stdout).eligible, false);
    assert.equal(JSON.parse(eligibility(temporaryRoot, candidateA, "push", "refs/heads/release").stdout).eligible, false);
    assert.notEqual(eligibility(temporaryRoot, candidateC).status, 0, "non-HEAD SHA unexpectedly eligible");

    execFileSync("git", ["checkout", "--quiet", candidateC], { cwd: temporaryRoot });
    execFileSync("git", ["branch", "--force", "master", candidateC], { cwd: temporaryRoot });
    const shallowRoot = path.join(shallowContainer, "repository");
    execFileSync("git", ["clone", "--quiet", "--depth=1", "--branch", "master", `file://${temporaryRoot}`, shallowRoot]);
    const shallowSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: shallowRoot, encoding: "utf8" }).trim();
    assert.notEqual(eligibility(shallowRoot, shallowSha).status, 0, "shallow history unexpectedly eligible");
    const unavailableRoot = path.join(shallowContainer, "unavailable");
    await mkdir(path.join(unavailableRoot, "scripts"), { recursive: true });
    await writeFile(path.join(unavailableRoot, "scripts", "release-intent-0.9.0.json"), exactMarker);
    assert.notEqual(eligibility(unavailableRoot, candidateA).status, 0, "unavailable history unexpectedly eligible");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
    await rm(shallowContainer, { recursive: true, force: true });
  }
});

test("constrains Registry lookup and npm publication to one npmjs boundary", async () => {
  const manifest = JSON.parse(await readFile(path.join(candidateRoot, "manifest.json"), "utf8"));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-publish-boundary-test-"));
  try {
    const fixturePath = path.join(temporaryRoot, "registry.json");
    const wrapperPath = path.join(temporaryRoot, "npm-wrapper.mjs");
    const logPath = path.join(temporaryRoot, "calls.jsonl");
    const invalidFixturePath = path.join(temporaryRoot, "registry-invalid.json");
    const hostileUserConfig = path.join(temporaryRoot, "hostile-user.npmrc");
    const responses = Object.fromEntries(manifest.packages.map((record) => [
      `${record.name}@${record.version}`,
      [{ status: 404 }, { status: 200, body: registryVersion(manifest, record) }],
    ]));
    await writeFile(fixturePath, `${JSON.stringify({ responses }, null, 2)}\n`);
    await writeFile(invalidFixturePath, "not-json\n");
    await writeFile(hostileUserConfig, "registry=https://registry.invalid/\n//registry.invalid/:_authToken=must-not-be-read\n");
    await writeFile(wrapperPath, `import { appendFileSync, readFileSync, realpathSync } from "node:fs";
const args = process.argv.slice(2);
const expectedRegistry = "https://registry.npmjs.org/";
const userConfig = process.env.NPM_CONFIG_USERCONFIG;
const globalConfig = process.env.NPM_CONFIG_GLOBALCONFIG;
if (args.length !== 7 || args[0] !== "publish" || !args[1].endsWith(".tgz") || args.slice(2).join(" ") !== "--provenance --access public --registry https://registry.npmjs.org/") process.exit(91);
if (!process.cwd().includes("miniagent-publish-command-") || process.cwd() === ${JSON.stringify(repositoryRoot)}) process.exit(92);
if (!userConfig || !globalConfig || realpathSync(userConfig).startsWith(${JSON.stringify(temporaryRoot)}) || readFileSync(globalConfig, "utf8") !== "") process.exit(93);
if (readFileSync(userConfig, "utf8") !== "registry=" + expectedRegistry + "\\n//registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}\\n") process.exit(94);
if (!Object.hasOwn(process.env, "NODE_AUTH_TOKEN") || !Object.hasOwn(process.env, "ACTIONS_ID_TOKEN_REQUEST_TOKEN") || !Object.hasOwn(process.env, "ACTIONS_ID_TOKEN_REQUEST_URL")) process.exit(95);
if (Object.hasOwn(process.env, "UNRELATED_TOKEN") || Object.hasOwn(process.env, "GITHUB_TOKEN")) process.exit(97);
if (Object.keys(process.env).some((key) => /^npm_config_/i.test(key) && !/^npm_config_(?:userconfig|globalconfig|registry)$/i.test(key))) process.exit(96);
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ args, cwd: process.cwd(), userConfig, globalConfig }) + "\\n");
`);
    const hostileEnvironment = {
      ...process.env,
      NODE_AUTH_TOKEN: "synthetic-publication-token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-oidc-token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example.invalid/id-token",
      NPM_CONFIG_USERCONFIG: hostileUserConfig,
      npm_config__authToken: "synthetic-hostile-token",
      npm_config_tag: "hostile-tag",
      UNRELATED_TOKEN: "must-not-reach-child",
      GITHUB_TOKEN: "must-not-reach-child",
    };
    const accepted = spawnSync(process.execPath, [
      "scripts/publish-release-packages.mjs",
      "--candidate", path.join(candidateRoot, "manifest.json"),
      "--registry-fixture", fixturePath,
      "--npm-command-fixture", wrapperPath,
    ], { cwd: repositoryRoot, encoding: "utf8", env: hostileEnvironment });
    assert.equal(accepted.status, 0, accepted.stderr);
    const calls = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(calls.length, 3);
    assert.equal(new Set(calls.map(({ cwd }) => cwd)).size, 1);
    assert.equal(new Set(calls.map(({ userConfig }) => userConfig)).size, 1);

    for (const missingKey of [
      "ACTIONS_ID_TOKEN_REQUEST_URL",
      "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
      "NODE_AUTH_TOKEN",
    ]) {
      const incompleteEnvironment = { ...hostileEnvironment };
      delete incompleteEnvironment[missingKey];
      const rejected = spawnSync(process.execPath, [
        "scripts/publish-release-packages.mjs",
        "--candidate", path.join(candidateRoot, "manifest.json"),
        "--registry-fixture", invalidFixturePath,
        "--npm-command-fixture", wrapperPath,
      ], { cwd: repositoryRoot, encoding: "utf8", env: incompleteEnvironment });
      assert.notEqual(rejected.status, 0, `${missingKey} unexpectedly passed`);
      assert.match(rejected.stderr, /publication credentials|OIDC|NODE_AUTH_TOKEN/i);
    }

    for (const [label, cwd, env] of [
      ["environment redirect", repositoryRoot, { ...hostileEnvironment, NPM_CONFIG_REGISTRY: "https://registry.invalid/" }],
      ["project config", temporaryRoot, hostileEnvironment],
    ]) {
      if (label === "project config") await writeFile(path.join(temporaryRoot, ".npmrc"), "registry=https://registry.invalid/\n");
      const rejected = spawnSync(process.execPath, [
        path.join(repositoryRoot, "scripts", "publish-release-packages.mjs"),
        "--candidate", path.join(candidateRoot, "manifest.json"),
        "--registry-fixture", fixturePath,
        "--dry-run",
      ], { cwd, encoding: "utf8", env });
      assert.notEqual(rejected.status, 0, `${label} unexpectedly passed`);
      assert.match(rejected.stderr, /Registry|npmrc|configuration/i);
    }
    assert.equal((await readFile(logPath, "utf8")).trim().split("\n").length, 3);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("workflow retains and reaccepts the candidate before serialized publication", async () => {
  const workflowText = await readFile(path.join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8");
  const workflow = parseYaml(workflowText);
  const publish = workflow.jobs.publish;
  const eligibility = workflow.jobs["release-eligibility"];
  const packageValidation = workflow.jobs["package-validation"];
  const releaseCandidate = workflow.jobs["release-candidate"];
  const externalActionReferences = Object.values(workflow.jobs).flatMap((job) => job.steps ?? [])
    .map(({ uses }) => uses)
    .filter((uses) => typeof uses === "string" && !uses.startsWith("./"));
  assert.equal(externalActionReferences.length, 13);
  assertApprovedExternalActionReferences(externalActionReferences);
  for (const rejectedReference of [
    "actions/checkout@v4",
    "actions/checkout@main",
    "actions/checkout@11d5960",
    "other-owner/checkout@11d5960a326750d5838078e36cf38b85af677262",
  ]) {
    assert.throws(
      () => assertApprovedExternalActionReferences([rejectedReference]),
      /not pinned|not approved/,
    );
  }
  assert.ok(externalActionReferences.some((reference) => reference.startsWith("actions/upload-artifact@")));
  assert.ok(externalActionReferences.some((reference) => reference.startsWith("actions/download-artifact@")));
  assert.ok(packageValidation, "pull requests do not run package validation");
  assert.equal(packageValidation.if, undefined);
  assert.equal(packageValidation.needs, undefined);
  assert.equal(packageValidation.steps[1].with["node-version"], "22.22.0");
  const packageValidationText = packageValidation.steps.map(({ run = "", uses = "" }) => `${uses}\n${run}`).join("\n");
  assert.match(packageValidationText, /npm@10\.9\.4/);
  assert.match(packageValidationText, /npm ci/);
  assert.match(packageValidationText, /npm run build/);
  assert.match(packageValidationText, /release:build -- --verify-determinism/);
  assert.match(packageValidationText, /npm run release:test(?:\s|$)/m);
  assert.match(packageValidationText, /release:verify -- --candidate \.release\/candidate\/manifest\.json/);
  assert.doesNotMatch(packageValidationText, /upload-artifact|download-artifact|release:publish|registry-smoke|NPM_TOKEN|secrets\.|NODE_AUTH_TOKEN/i);
  assert.equal(packageValidation.permissions, undefined);
  assert.deepEqual(eligibility.needs, ["check", "package-validation"]);
  assert.deepEqual(releaseCandidate.needs, ["check", "package-validation", "release-eligibility"]);
  assert.deepEqual(publish.needs, ["check", "package-validation", "release-eligibility", "release-candidate"]);
  assert.equal(releaseCandidate.if, "needs.release-eligibility.outputs.eligible == 'true'");
  assert.equal(publish.if, "needs.release-eligibility.outputs.eligible == 'true'");
  assert.equal(eligibility.steps[0].with["fetch-depth"], 0);
  assert.match(eligibility.steps.map(({ run = "" }) => run).join("\n"), /release-eligibility\.mjs[^\n]+github\.sha/);
  assert.deepEqual(publish.concurrency, { group: "miniagent-npm-0.9.0", "cancel-in-progress": false });
  assert.deepEqual(publish.permissions, { contents: "read", actions: "read", "id-token": "write" });
  assert.match(workflowText, /node-version: 22\.22\.0/);
  assert.match(workflowText, /npm@10\.9\.4/);
  assert.match(workflowText, /miniagent-0\.9\.0-candidate-\$\{\{ github\.sha \}\}-\$\{\{ github\.run_id \}\}/i);
  const uploadSteps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? [])
    .filter(({ uses = "" }) => uses.startsWith("actions/upload-artifact@"));
  assert.equal(uploadSteps.length, 1);
  const [candidateUpload] = uploadSteps;
  assert.equal(candidateUpload.with.path, ".release/candidate");
  assert.equal(candidateUpload.with["include-hidden-files"], true);
  assert.equal(candidateUpload.with["if-no-files-found"], "error");
  assert.notEqual(candidateUpload.with.path, ".");
  const hiddenOptInSteps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? [])
    .filter((step) => step.with?.["include-hidden-files"] !== undefined);
  assert.deepEqual(hiddenOptInSteps, [candidateUpload]);
  const candidateUploadIndex = releaseCandidate.steps.indexOf(candidateUpload);
  const residueIndex = releaseCandidate.steps.findIndex(({ name = "" }) => /residue/i.test(name));
  assert.ok(residueIndex >= 0 && residueIndex < candidateUploadIndex);
  const residueCheck = releaseCandidate.steps[residueIndex].run;
  assert.match(residueCheck, /test -f \.release\/candidate\/manifest\.json/);
  assert.match(residueCheck, /find \.release\/candidate.*\.npmrc.*\.pem.*\.key/);
  assert.match(residueCheck, /find \.release\/candidate\/archives -type f -name '\*\.tgz'.*wc -l.*3/);
  const uploadIndex = workflowText.indexOf("actions/upload-artifact");
  const publishIndex = workflowText.indexOf("npm run release:publish");
  assert.ok(uploadIndex >= 0 && publishIndex > uploadIndex);
  assert.match(workflowText, /npm run release:verify[\s\S]+actions\/upload-artifact/);
  assert.match(workflowText, /actions\/download-artifact[\s\S]+npm run release:verify[\s\S]+npm run release:publish/);
  const downloadIndex = publish.steps.findIndex(({ uses = "" }) => uses.startsWith("actions/download-artifact@"));
  const reverifyIndex = publish.steps.findIndex(({ run = "" }) => run.includes("release:verify"));
  const exactPublishIndex = publish.steps.findIndex(({ run = "" }) => run.includes("release:publish"));
  const smokeIndex = publish.steps.findIndex(({ run = "" }) => run.includes("release:registry-smoke"));
  assert.ok(downloadIndex >= 0 && downloadIndex < reverifyIndex && reverifyIndex < exactPublishIndex && exactPublishIndex < smokeIndex);
  assert.equal(publish.steps[downloadIndex].with.path, ".release/candidate");
  assert.match(publish.steps[reverifyIndex].run, /release:verify -- --candidate \.release\/candidate\/manifest\.json/);
  assert.match(workflowText, /release:test -- --skip-generation/);
  assert.match(workflowText, /run-record\.json/);
  assert.match(workflowText, /GITHUB_RUN_ATTEMPT/);
  assert.match(workflowText, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.equal((workflowText.match(/secrets\.NPM_TOKEN/g) ?? []).length, 1);
  const pullRequestRunnableJobs = Object.entries(workflow.jobs)
    .filter(([, job]) => job.if === undefined || !job.if.includes("release-eligibility.outputs.eligible"))
    .map(([name]) => name);
  assert.deepEqual(pullRequestRunnableJobs.sort(), ["check", "package-validation", "release-eligibility"]);
  const pullRequestRunnableText = pullRequestRunnableJobs.map((name) => JSON.stringify(workflow.jobs[name])).join("\n");
  assert.doesNotMatch(pullRequestRunnableText, /upload-artifact|release:publish|secrets\.NPM_TOKEN|id-token/i);
  assert.match(workflowText, /npm run release:registry-smoke[^\n]+--require-provenance/);
  assert.doesNotMatch(workflowText, /npm publish(?:\s|$)(?!.*\.tgz)/m);
});
