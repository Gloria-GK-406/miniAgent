import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { releasePackageContract as contract } from "./release/package-contract.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedPackageNames = contract.packages.map(({ name }) => name);
const textArtifactPattern = /\.(?:js|d\.ts|map)$/;
const allowedArtifactPattern = /^(?:dist\/.+\.(?:js|d\.ts|js\.map|d\.ts\.map)|LICENSE|README\.md|package\.json)$/;

function fail(message) {
  throw new Error(message);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertEqual(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    fail(`Invalid ${label}`);
  }
}

function safeRelative(root, relativePath, label) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) fail(`Invalid ${label}`);
  const resolved = path.resolve(root, relativePath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) fail(`Unsafe ${label}`);
  return resolved;
}

async function canonicalContainedPath(root, targetPath, label, expectedType) {
  const targetStat = await lstat(targetPath);
  if (targetStat.isSymbolicLink()) fail(`Symlink is forbidden for ${label}`);
  if (expectedType === "directory" && !targetStat.isDirectory()) fail(`Expected directory for ${label}`);
  if (expectedType === "file" && !targetStat.isFile()) fail(`Expected file for ${label}`);
  const canonicalRoot = await realpath(root);
  const canonicalTarget = await realpath(targetPath);
  if (canonicalTarget === canonicalRoot || !canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`)) {
    fail(`Canonical containment failed for ${label}`);
  }
  return canonicalTarget;
}

async function listFiles(root) {
  const canonicalRoot = await realpath(root);
  const result = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      const entryStat = await lstat(absolutePath);
      if (entry.isSymbolicLink() || entryStat.isSymbolicLink()) fail(`Symlink is forbidden in candidate inventory: ${absolutePath}`);
      const canonicalEntry = await realpath(absolutePath);
      if (!canonicalEntry.startsWith(`${canonicalRoot}${path.sep}`)) fail(`Canonical containment failed for inventory entry: ${absolutePath}`);
      if (entry.isDirectory() && entryStat.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && entryStat.isFile()) result.push(path.relative(root, absolutePath).split(path.sep).join("/"));
      else fail(`Unsupported candidate inventory entry: ${absolutePath}`);
    }
  }
  await visit(root);
  return result;
}

function integrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function expectedManifest(packageContract, marker) {
  return {
    name: packageContract.name,
    version: contract.version,
    description: `MiniAgent ${packageContract.id} package`,
    license: "MIT",
    repository: contract.repository,
    type: "module",
    exports: packageContract.exports,
    files: ["dist", "LICENSE", "README.md"],
    dependencies: packageContract.dependencies,
    publishConfig: { access: "public" },
    miniagentRelease: marker,
  };
}

function assertInventory(inventory, packageName) {
  if (!Array.isArray(inventory) || new Set(inventory).size !== inventory.length) {
    fail(`Invalid inventory for ${packageName}`);
  }
  for (const entry of inventory) {
    if (typeof entry !== "string" || !allowedArtifactPattern.test(entry)) {
      fail(`Forbidden inventory entry for ${packageName}: ${entry}`);
    }
    if (/(?:^|\/)(?:cli|src|test|tests)(?:\/|$)/i.test(entry) || entry.endsWith("package-lock.json")) {
      fail(`Forbidden layer in inventory for ${packageName}: ${entry}`);
    }
  }
}

async function assertReferences(packageRoot, inventory, packageName) {
  for (const entry of inventory.filter((item) => textArtifactPattern.test(item))) {
    const content = await readFile(path.join(packageRoot, entry), "utf8");
    if (/(?:\.\.\/)+core(?:\/index\.js)?/.test(content) || /file:(?:\.\.?\/|\/)/.test(content)) {
      fail(`Escaping or repository reference in ${packageName}/${entry}`);
    }
    if (entry.endsWith(".map")) {
      let sourceMap;
      try {
        sourceMap = JSON.parse(content);
      } catch {
        fail(`Invalid source-map reference metadata in ${packageName}/${entry}`);
      }
      if (sourceMap.sourceRoot !== "" || !Array.isArray(sourceMap.sources)
        || sourceMap.sources.some((source) => !/^\.\/[^/]+$/.test(source))) {
        fail(`Escaping source-map reference in ${packageName}/${entry}`);
      }
    }
  }
}

function archiveInventory(archivePath) {
  const verboseEntries = execFileSync("tar", ["-tvzf", archivePath], { encoding: "utf8" })
    .split("\n").filter(Boolean);
  if (verboseEntries.some((entry) => !/^[d-]/.test(entry))) fail(`Archive links are forbidden: ${archivePath}`);
  const entries = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" })
    .split("\n").filter(Boolean);
  if (entries.some((entry) => entry === "package" || entry === "package/" || !entry.startsWith("package/")
    || entry.includes("../") || entry.startsWith("/"))) {
    fail(`Unsafe archive inventory: ${archivePath}`);
  }
  return entries.filter((entry) => !entry.endsWith("/")).map((entry) => entry.slice("package/".length)).sort();
}

function npmEnvironment(userConfigPath, globalConfigPath) {
  const env = {};
  for (const key of Object.keys(process.env)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "npm_config_userconfig" || lowerKey === "npm_config_globalconfig"
      || /(?:^|_)(?:auth|token|otp|password|credential|secret)(?:_|$)/.test(lowerKey)
      || (/^npm_config_/.test(lowerKey) && /(?:auth|token|otp|password|username|credential|secret|cert|key)/.test(lowerKey))) continue;
    env[key] = process.env[key];
  }
  env.NPM_CONFIG_USERCONFIG = userConfigPath;
  env.NPM_CONFIG_GLOBALCONFIG = globalConfigPath;
  return env;
}

async function verifyPolicy(manifestPath, npmEnv, npmWorkingRoot) {
  const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assertEqual(rootPackage.repository, contract.repository, "root repository metadata");
  const candidateRoot = path.dirname(await realpath(manifestPath));
  await canonicalContainedPath(candidateRoot, manifestPath, "candidate manifest", "file");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.version !== contract.version
    || !/^[0-9a-f]{40}$/.test(manifest.sourceRevision)
    || !/^sha256:[0-9a-f]{64}$/.test(manifest.candidateId)) {
    fail("Invalid candidate manifest metadata");
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length !== contract.packages.length) {
    fail("Invalid candidate package inventory");
  }
  assertEqual(manifest.packages.map(({ name }) => name), expectedPackageNames, "candidate package inventory");

  const reports = [];
  const archives = [];
  const identityHash = createHash("sha256");
  identityHash.update(stableJson({ contract, sourceRevision: manifest.sourceRevision }));
  for (const [index, packageContract] of contract.packages.entries()) {
    const record = manifest.packages[index];
    if (record.version !== contract.version || record.candidateId !== manifest.candidateId
      || record.directory !== `packages/${packageContract.id}`
      || typeof record.integrity !== "string" || !record.integrity.startsWith("sha512-")) {
      fail(`Invalid candidate identity for ${packageContract.name}`);
    }
    const packageRoot = await canonicalContainedPath(
      candidateRoot,
      safeRelative(candidateRoot, record.directory, "candidate package directory"),
      "candidate package directory",
      "directory",
    );
    const archivePath = await canonicalContainedPath(
      candidateRoot,
      safeRelative(candidateRoot, record.archive, "candidate archive path"),
      "candidate archive path",
      "file",
    );
    archives.push(archivePath);
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    const marker = { sourceRevision: manifest.sourceRevision, candidateId: manifest.candidateId };
    assertEqual(packageJson, expectedManifest(packageContract, marker), `package manifest/exports/dependencies/peers for ${packageContract.name}`);
    if (packageJson.peerDependencies !== undefined || packageJson.bin !== undefined) {
      fail(`Invalid peer or CLI metadata for ${packageContract.name}`);
    }
    const diskInventory = await listFiles(packageRoot);
    assertInventory(record.inventory, packageContract.name);
    assertEqual(diskInventory, record.inventory, `inventory for ${packageContract.name}`);
    await assertReferences(packageRoot, diskInventory, packageContract.name);
    identityHash.update(stableJson(expectedManifest(packageContract, {
      sourceRevision: manifest.sourceRevision,
      candidateId: "",
    })));
    for (const entry of diskInventory.filter((item) => item !== "package.json")) {
      identityHash.update(entry);
      identityHash.update(await readFile(path.join(packageRoot, entry)));
    }
    for (const targets of Object.values(packageContract.exports)) {
      for (const target of Object.values(targets)) {
        if (!diskInventory.includes(target.replace(/^\.\//, ""))) fail(`Missing exports target ${target}`);
      }
    }
    const archiveBytes = await readFile(archivePath);
    if (integrity(archiveBytes) !== record.integrity) fail(`Archive integrity changed for ${packageContract.name}`);
    assertEqual(archiveInventory(archivePath), [...record.inventory].sort(), `archive inventory for ${packageContract.name}`);
    const extractionRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-archive-"));
    try {
      const canonicalExtractionRoot = await realpath(extractionRoot);
      execFileSync("tar", ["-xzf", archivePath, "-C", extractionRoot]);
      const extractedPackageRoot = await canonicalContainedPath(
        canonicalExtractionRoot,
        path.join(extractionRoot, "package"),
        "extracted package root",
        "directory",
      );
      const extractedPackageJson = JSON.parse(await readFile(path.join(extractedPackageRoot, "package.json"), "utf8"));
      assertEqual(
        extractedPackageJson,
        expectedManifest(packageContract, marker),
        `archive package manifest/repository for ${packageContract.name}`,
      );
      assertEqual(await listFiles(extractedPackageRoot), diskInventory, `extracted inventory for ${packageContract.name}`);
      for (const entry of diskInventory) {
        const candidateBytes = await readFile(path.join(packageRoot, entry));
        const extractedPath = await canonicalContainedPath(
          canonicalExtractionRoot,
          path.join(extractedPackageRoot, entry),
          `extracted ${packageContract.name}/${entry}`,
          "file",
        );
        const archiveBytesForEntry = await readFile(extractedPath);
        if (!candidateBytes.equals(archiveBytesForEntry)) fail(`Archive content mismatch for ${packageContract.name}/${entry}`);
      }
    } finally {
      await rm(extractionRoot, { recursive: true, force: true });
    }

    const packJson = JSON.parse(execFileSync("npm", ["pack", packageRoot, "--json", "--dry-run"], {
      cwd: npmWorkingRoot,
      encoding: "utf8",
      env: npmEnv,
    }));
    const packedFiles = packJson[0]?.files?.map(({ path: entry }) => entry).sort();
    assertEqual(packedFiles, [...record.inventory].sort(), `npm pack inventory for ${packageContract.name}`);
    reports.push({ name: packageContract.name, entries: Object.keys(packageContract.exports).length, files: record.inventory.length });
  }
  const calculatedCandidateId = `sha256:${identityHash.digest("hex")}`;
  if (calculatedCandidateId !== manifest.candidateId) fail("Candidate identity does not match the accepted package trees");
  return { manifest, candidateRoot, archives, reports };
}

function dependencyAt(tree, name) {
  const dependency = tree.dependencies?.[name];
  if (!dependency) fail(`Missing installed dependency ${name}`);
  return dependency;
}

async function verifyConsumer(policy, npmEnv) {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-consumer-"));
  try {
    const canonicalConsumerRoot = await realpath(consumerRoot);
    await writeFile(path.join(consumerRoot, "package.json"), `${JSON.stringify({
      name: "miniagent-release-consumer",
      version: "1.0.0",
      private: true,
      type: "module",
    }, null, 2)}\n`);
    execFileSync("npm", ["install", "--strict-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund", ...policy.archives], {
      cwd: consumerRoot,
      stdio: "pipe",
      env: npmEnv,
    });
    const tree = JSON.parse(execFileSync("npm", ["ls", "--all", "--json"], { cwd: consumerRoot, encoding: "utf8", env: npmEnv }));
    const core = dependencyAt(tree, contract.packages[0].name);
    const engine = dependencyAt(tree, contract.packages[1].name);
    const extensions = dependencyAt(tree, contract.packages[2].name);
    if (core.version !== contract.version || engine.dependencies?.[contract.packages[0].name]?.version !== contract.version
      || extensions.dependencies?.[contract.packages[0].name]?.version !== contract.version
      || engine.dependencies?.[contract.packages[2].name] || extensions.dependencies?.[contract.packages[1].name]) {
      fail("Invalid installed MiniAgent dependency graph");
    }
    const zodPaths = [];
    for (const packageName of expectedPackageNames) {
      const packageRoot = path.join(consumerRoot, "node_modules", ...packageName.split("/"));
      const packageStat = await lstat(packageRoot);
      if (packageStat.isSymbolicLink() || !(await realpath(packageRoot)).startsWith(`${canonicalConsumerRoot}${path.sep}`)) {
        fail(`Consumer package links to repository: ${packageName}`);
      }
      const require = createRequire(path.join(packageRoot, "package.json"));
      zodPaths.push(await realpath(require.resolve("zod/package.json")));
    }
    if (new Set(zodPaths).size !== 1) fail("Consumer resolved more than one Zod installation");
    const zodVersion = JSON.parse(await readFile(zodPaths[0], "utf8")).version;

    const entries = contract.packages.flatMap((packageContract) => Object.keys(packageContract.exports).map((entry) => (
      entry === "." ? packageContract.name : `${packageContract.name}${entry.slice(1)}`
    )));
    const runtimePath = path.join(consumerRoot, "runtime.mjs");
    await writeFile(runtimePath, `${entries.map((entry, index) => `import * as entry${index} from ${JSON.stringify(entry)};`).join("\n")}
const entries = [${entries.map((_, index) => `entry${index}`).join(", ")}];
if (entries.some((entry) => typeof entry !== "object")) process.exit(1);
console.log(${JSON.stringify(entries)}.join("\\n"));
`);
    const runtimeResults = execFileSync(process.execPath, [runtimePath], { cwd: consumerRoot, encoding: "utf8" }).trim().split("\n");
    assertEqual(runtimeResults, entries, "runtime entry results");

    const typesPath = path.join(consumerRoot, "types.ts");
    await writeFile(typesPath, `${entries.map((entry, index) => `import type * as Entry${index} from ${JSON.stringify(entry)};\ntype Probe${index} = keyof typeof Entry${index};`).join("\n")}
export type Probes = [${entries.map((_, index) => `Probe${index}`).join(", ")}];
`);
    await writeFile(path.join(consumerRoot, "tsconfig.json"), `${JSON.stringify({ compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    }, files: ["types.ts"] }, null, 2)}\n`);
    const typescriptBin = path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [typescriptBin, "--project", path.join(consumerRoot, "tsconfig.json")], {
      cwd: consumerRoot,
      stdio: "pipe",
    });
    return { consumerRoot, zodVersion, entries, runtimeResults, typeResults: entries };
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const candidateArgument = argument("--candidate");
  if (!candidateArgument) fail("Missing --candidate manifest path");
  const manifestPath = path.resolve(process.cwd(), candidateArgument);
  const npmConfigRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-npm-config-"));
  try {
    const canonicalNpmConfigRoot = await realpath(npmConfigRoot);
    const userConfigPath = path.join(npmConfigRoot, "empty.npmrc");
    const globalConfigPath = path.join(npmConfigRoot, "empty-global.npmrc");
    await writeFile(userConfigPath, "");
    await writeFile(globalConfigPath, "");
    await canonicalContainedPath(npmConfigRoot, userConfigPath, "owned npm user config", "file");
    await canonicalContainedPath(npmConfigRoot, globalConfigPath, "owned npm global config", "file");
    const npmEnv = npmEnvironment(userConfigPath, globalConfigPath);
    const policy = await verifyPolicy(manifestPath, npmEnv, canonicalNpmConfigRoot);
    if (process.argv.includes("--policy-only")) {
      console.log(JSON.stringify({ candidateId: policy.manifest.candidateId, packages: policy.reports }, null, 2));
      return;
    }
    const consumer = await verifyConsumer(policy, npmEnv);
    console.log(JSON.stringify({
      candidateId: policy.manifest.candidateId,
      packages: policy.reports,
      dependencyGraph: "engine/extensions -> core@0.9.1; no horizontal dependency",
      zodVersion: consumer.zodVersion,
      runtimeEntries: consumer.runtimeResults,
      typeEntries: consumer.typeResults,
    }, null, 2));
  } finally {
    await rm(npmConfigRoot, { recursive: true, force: true });
  }
}

await main();
