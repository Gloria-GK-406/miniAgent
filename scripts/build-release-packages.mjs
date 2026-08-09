import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { releasePackageContract as contract } from "./release/package-contract.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = path.join(repositoryRoot, ".release", "candidate");
const textArtifactPattern = /\.(?:js|d\.ts|map)$/;
const allowedArtifactPattern = /\.(?:js|d\.ts|js\.map|d\.ts\.map)$/;
const coreReferencePattern = /(["'])(?:\.\.\/)+core\/[^"']+\1/g;

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function sri(input) {
  return `sha512-${createHash("sha512").update(input).digest("base64")}`;
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
  env.SOURCE_DATE_EPOCH = "0";
  return env;
}

async function createNpmContext() {
  const root = await mkdtemp(path.join(os.tmpdir(), "miniagent-generator-npm-"));
  const canonicalRoot = await realpath(root);
  const userConfigPath = path.join(canonicalRoot, "empty-user.npmrc");
  const globalConfigPath = path.join(canonicalRoot, "empty-global.npmrc");
  await writeFile(userConfigPath, "");
  await writeFile(globalConfigPath, "");
  return {
    root: canonicalRoot,
    env: npmEnvironment(userConfigPath, globalConfigPath),
  };
}

function npmVersion(npmContext) {
  return execFileSync("npm", ["--version"], {
    cwd: npmContext.root,
    encoding: "utf8",
    env: npmContext.env,
  }).trim();
}

function assertToolchain(npmContext) {
  const actualNode = process.versions.node;
  const actualNpm = npmVersion(npmContext);
  if (actualNode !== contract.toolchain.node || actualNpm !== contract.toolchain.npm) {
    throw new Error(
      `Release packing requires Node ${contract.toolchain.node} and npm ${contract.toolchain.npm}; received Node ${actualNode} and npm ${actualNpm}`,
    );
  }
}

function assertSafeOutput(outputRoot) {
  const resolved = path.resolve(outputRoot);
  const filesystemRoot = path.parse(resolved).root;
  if (resolved === filesystemRoot || path.basename(resolved) !== "candidate") {
    throw new Error(`Unsafe release output path: ${resolved}`);
  }
  const allowedFinal = resolved === candidateRoot;
  const allowedTemporary = resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`);
  if (!allowedFinal && !allowedTemporary) {
    throw new Error(`Release output is outside an approved root: ${resolved}`);
  }
}

async function listFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlinks are forbidden in release candidates: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolutePath).split(path.sep).join("/"));
      } else {
        throw new Error(`Unsupported release artifact: ${absolutePath}`);
      }
    }
  }
  await visit(root);
  return files;
}

async function copyCompiledLayer(packageContract, packageRoot) {
  const sourceRoot = path.join(repositoryRoot, packageContract.source);
  const sourceStat = await lstat(sourceRoot);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Missing compiled layer: ${packageContract.source}`);
  }
  const distRoot = path.join(packageRoot, "dist");
  await mkdir(distRoot, { recursive: true });
  for (const relativePath of await listFiles(sourceRoot)) {
    if (!allowedArtifactPattern.test(relativePath)) {
      throw new Error(`Unexpected compiled artifact in ${packageContract.source}: ${relativePath}`);
    }
    const sourcePath = path.join(sourceRoot, relativePath);
    const targetPath = path.join(distRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    let content = await readFile(sourcePath, "utf8");
    if (relativePath.endsWith(".map")) {
      const sourceMap = JSON.parse(content);
      sourceMap.sourceRoot = "";
      sourceMap.sources = sourceMap.sources.map((source) => `./${path.basename(source)}`);
      content = `${JSON.stringify(sourceMap)}\n`;
    } else if (packageContract.id !== "core") {
      content = content.replace(coreReferencePattern, "$1@piaoxianguo/miniagent-core$1");
    }
    await writeFile(targetPath, content);
  }
}

function packageManifest(packageContract, candidateId, sourceRevision) {
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
    miniagentRelease: { sourceRevision, candidateId },
  };
}

async function assertRootRepository() {
  const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  if (stableJson(rootPackage.repository) !== stableJson(contract.repository)) {
    throw new Error("Root repository metadata does not match the canonical release contract");
  }
}

async function scanPackage(packageContract, packageRoot) {
  const inventory = await listFiles(packageRoot);
  for (const relativePath of inventory) {
    if (/^(?:cli|src|test|tests)(?:\/|$)/i.test(relativePath) || /(?:^|\/)package-lock\.json$/.test(relativePath)) {
      throw new Error(`Forbidden package content: ${packageContract.name}/${relativePath}`);
    }
    if (textArtifactPattern.test(relativePath)) {
      const content = await readFile(path.join(packageRoot, relativePath), "utf8");
      if (/(?:\.\.\/)+core(?:\/index\.js)?/.test(content)) {
        throw new Error(`Escaping core reference: ${packageContract.name}/${relativePath}`);
      }
    }
  }
  for (const targets of Object.values(packageContract.exports)) {
    for (const target of Object.values(targets)) {
      if (!inventory.includes(target.replace(/^\.\//, ""))) {
        throw new Error(`Missing export target ${target} in ${packageContract.name}`);
      }
    }
  }
  return inventory;
}

async function treeIdentity(packageRoots, manifestsWithoutMarker) {
  const hash = createHash("sha256");
  hash.update(stableJson({ contract, sourceRevision: manifestsWithoutMarker.sourceRevision }));
  for (const packageContract of contract.packages) {
    const packageRoot = packageRoots.get(packageContract.id);
    hash.update(stableJson(manifestsWithoutMarker.packages[packageContract.id]));
    for (const relativePath of await listFiles(packageRoot)) {
      hash.update(relativePath);
      hash.update(await readFile(path.join(packageRoot, relativePath)));
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

async function generate(outputRoot, sourceRevision, npmContext) {
  await assertRootRepository();
  assertSafeOutput(outputRoot);
  await rm(outputRoot, { recursive: true, force: true });
  const packagesRoot = path.join(outputRoot, "packages");
  const archivesRoot = path.join(outputRoot, "archives");
  await mkdir(packagesRoot, { recursive: true });
  await mkdir(archivesRoot, { recursive: true });

  const packageRoots = new Map();
  const manifestsWithoutMarker = { sourceRevision, packages: {} };
  for (const packageContract of contract.packages) {
    const packageRoot = path.join(packagesRoot, packageContract.id);
    packageRoots.set(packageContract.id, packageRoot);
    await mkdir(packageRoot, { recursive: true });
    await copyCompiledLayer(packageContract, packageRoot);
    await cp(path.join(repositoryRoot, "LICENSE"), path.join(packageRoot, "LICENSE"));
    await cp(path.join(repositoryRoot, "README.md"), path.join(packageRoot, "README.md"));
    manifestsWithoutMarker.packages[packageContract.id] = packageManifest(packageContract, "", sourceRevision);
  }

  const candidateId = await treeIdentity(packageRoots, manifestsWithoutMarker);
  const packageRecords = [];
  for (const packageContract of contract.packages) {
    const packageRoot = packageRoots.get(packageContract.id);
    await writeFile(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify(packageManifest(packageContract, candidateId, sourceRevision), null, 2)}\n`,
    );
    const inventory = await scanPackage(packageContract, packageRoot);
    const packResult = JSON.parse(execFileSync(
      "npm",
      ["pack", packageRoot, "--json", "--pack-destination", archivesRoot],
      { cwd: npmContext.root, encoding: "utf8", env: npmContext.env },
    ));
    const packed = packResult[0];
    if (!packed?.filename) {
      throw new Error(`npm pack did not return an archive for ${packageContract.name}`);
    }
    const archive = `archives/${packed.filename}`;
    const archiveBytes = await readFile(path.join(outputRoot, archive));
    packageRecords.push({
      name: packageContract.name,
      version: contract.version,
      directory: `packages/${packageContract.id}`,
      archive,
      candidateId,
      integrity: sri(archiveBytes),
      inventory,
    });
  }
  const manifest = {
    schemaVersion: 1,
    version: contract.version,
    sourceRevision,
    candidateId,
    packages: packageRecords,
  };
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function snapshot(root) {
  const result = [];
  for (const relativePath of await listFiles(root)) {
    result.push([relativePath, sha256(await readFile(path.join(root, relativePath)))]);
  }
  return result;
}

async function main() {
  const npmContext = await createNpmContext();
  try {
    assertToolchain(npmContext);
    if (process.argv.includes("--check-toolchain")) {
      console.log(`release toolchain ok: node ${contract.toolchain.node}, npm ${contract.toolchain.npm}`);
      return;
    }
    const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    if (process.argv.includes("--verify-determinism")) {
      const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-release-"));
      try {
        const first = path.join(temporaryRoot, "first", "candidate");
        const second = path.join(temporaryRoot, "second", "candidate");
        await generate(first, sourceRevision, npmContext);
        await generate(second, sourceRevision, npmContext);
        assert.deepEqual(await snapshot(first), await snapshot(second));
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    }
    const manifest = await generate(candidateRoot, sourceRevision, npmContext);
    console.log(`generated ${manifest.packages.length} packages for ${manifest.candidateId}`);
  } finally {
    await rm(npmContext.root, { recursive: true, force: true });
  }
}

const assert = { deepEqual(actual, expected) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error("Release generation is not byte-identical");
  }
} };

await realpath(repositoryRoot);
await main();
