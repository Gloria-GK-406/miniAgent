import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { releasePackageContract as contract } from "./release/package-contract.mjs";

const REGISTRY_ORIGIN = "https://registry.npmjs.org";
const REGISTRY_URL = `${REGISTRY_ORIGIN}/`;
const MAX_REGISTRY_BODY_BYTES = 1_048_576;
const SLSA_PREDICATES = new Set([
  "https://slsa.dev/provenance/v0.2",
  "https://slsa.dev/provenance/v1",
]);
const SIGSTORE_MEDIA_VERSIONS = new Map([
  ["application/vnd.dev.sigstore.bundle+json;version=0.1", "0.1"],
  ["application/vnd.dev.sigstore.bundle+json;version=0.2", "0.2"],
  ["application/vnd.dev.sigstore.bundle+json;version=0.3", "0.3"],
  ["application/vnd.dev.sigstore.bundle.v0.3+json", "0.3"],
]);

function fail(message) {
  throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function npmEnvironment(userConfig, globalConfig, cache) {
  const env = {};
  const safeKeys = new Set([
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "CI",
  ]);
  for (const key of Object.keys(process.env)) {
    if (safeKeys.has(key)) env[key] = process.env[key];
  }
  env.NPM_CONFIG_USERCONFIG = userConfig;
  env.NPM_CONFIG_GLOBALCONFIG = globalConfig;
  env.NPM_CONFIG_REGISTRY = REGISTRY_URL;
  env.NPM_CONFIG_CACHE = cache;
  return env;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRepository(value) {
  if (typeof value !== "string") return undefined;
  let normalized = value.trim().replace(/^git\+/, "").replace(/^git@github\.com:/, "https://github.com/");
  const revisionIndex = normalized.indexOf("@refs/");
  if (revisionIndex !== -1) normalized = normalized.slice(0, revisionIndex);
  normalized = normalized.replace(/\.git$/, "").replace(/\/$/, "");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) return undefined;
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function decodeCanonicalBase64(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(`Malformed ${label}`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.length > MAX_REGISTRY_BODY_BYTES || bytes.toString("base64") !== value) {
    fail(`Malformed ${label}`);
  }
  return bytes;
}

function decodeBase64Json(value, label) {
  const bytes = decodeCanonicalBase64(value, label);
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isObject(parsed)) fail(`Malformed ${label}`);
    return parsed;
  } catch {
    fail(`Malformed ${label}`);
  }
}

function parseCertificate(value, label) {
  if (!isObject(value)) fail(`Malformed ${label}`);
  const bytes = decodeCanonicalBase64(value.rawBytes, label);
  try {
    return new X509Certificate(bytes);
  } catch {
    fail(`Malformed ${label}`);
  }
}

function validateLeafCertificate(value, label) {
  const certificate = parseCertificate(value, label);
  if (certificate.ca || certificate.publicKey === undefined) fail(`Malformed ${label}`);
  return certificate;
}

function validateVerificationMaterial(material, mediaType, packageName) {
  if (!isObject(material)) fail(`Malformed Sigstore verification material for ${packageName}`);
  const version = SIGSTORE_MEDIA_VERSIONS.get(mediaType);
  if (!version) fail(`Unsupported Sigstore bundle for ${packageName}`);
  const alternatives = [material.publicKey, material.x509CertificateChain, material.certificate]
    .filter((value) => value !== undefined);
  if (alternatives.length !== 1) fail(`Malformed Sigstore verification material for ${packageName}`);
  if (version === "0.1" || version === "0.2") {
    const certificates = material.x509CertificateChain?.certificates;
    if (!Array.isArray(certificates) || certificates.length === 0) {
      fail(`Malformed Sigstore verification material for ${packageName}`);
    }
    const parsedCertificates = [
      validateLeafCertificate(certificates[0], `Sigstore leaf certificate for ${packageName}`),
      ...certificates.slice(1).map((certificate) => parseCertificate(
        certificate,
        `Sigstore issuer certificate for ${packageName}`,
      )),
    ];
    for (let index = 1; index < parsedCertificates.length; index += 1) {
      const child = parsedCertificates[index - 1];
      const issuer = parsedCertificates[index];
      if (!issuer.ca || issuer.publicKey === undefined
        || !child.checkIssued(issuer) || !child.verify(issuer.publicKey)) {
        fail(`Malformed Sigstore certificate chain for ${packageName}`);
      }
    }
    return;
  }
  validateLeafCertificate(material.certificate, `Sigstore leaf certificate for ${packageName}`);
}

function expectedSha512(integrity) {
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) fail("Retained integrity is not SHA-512");
  const encoded = integrity.slice("sha512-".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail("Retained integrity is malformed");
  const digest = Buffer.from(encoded, "base64");
  if (digest.length !== 64 || digest.toString("base64") !== encoded) fail("Retained integrity is malformed");
  return digest.toString("hex");
}

function sourceEntryMatches(entry, expectedRepository, sourceRevision) {
  return isObject(entry)
    && normalizeRepository(entry.uri) === expectedRepository
    && isObject(entry.digest)
    && Object.entries(entry.digest).some(([algorithm, digest]) => (
      ["gitCommit", "sha1"].includes(algorithm) && digest === sourceRevision
    ));
}

function statementHasExpectedSource(statement, expectedRepository, sourceRevision) {
  const predicate = statement.predicate;
  if (!isObject(predicate)) return false;
  if (statement.predicateType === "https://slsa.dev/provenance/v1") {
    const definition = predicate.buildDefinition;
    const workflowRepository = definition?.externalParameters?.workflow?.repository;
    return isObject(definition)
      && normalizeRepository(workflowRepository) === expectedRepository
      && Array.isArray(definition.resolvedDependencies)
      && definition.resolvedDependencies.some((entry) => sourceEntryMatches(entry, expectedRepository, sourceRevision));
  }
  const configSource = predicate.invocation?.configSource;
  return isObject(configSource)
    && normalizeRepository(configSource.uri) === expectedRepository
    && isObject(configSource.digest)
    && Object.entries(configSource.digest).some(([algorithm, digest]) => (
      ["gitCommit", "sha1"].includes(algorithm) && digest === sourceRevision
    ))
    && Array.isArray(predicate.materials)
    && predicate.materials.some((entry) => sourceEntryMatches(entry, expectedRepository, sourceRevision));
}

function validateProvenance(payload, record, manifest, expectedRepository) {
  if (!isObject(payload) || !Array.isArray(payload.attestations)) fail(`Malformed provenance attestations for ${record.name}`);
  const provenance = payload.attestations.filter((attestation) => (
    isObject(attestation) && SLSA_PREDICATES.has(attestation.predicateType)
  ));
  if (provenance.length !== 1) fail(`Missing or ambiguous provenance attestation for ${record.name}`);
  const attestation = provenance[0];
  const bundle = attestation.bundle;
  if (!isObject(bundle) || !isObject(bundle.dsseEnvelope)
    || bundle.dsseEnvelope.payloadType !== "application/vnd.in-toto+json"
    || !Array.isArray(bundle.dsseEnvelope.signatures) || bundle.dsseEnvelope.signatures.length !== 1
    || !isObject(bundle.dsseEnvelope.signatures[0])) {
    fail(`Malformed Sigstore provenance bundle for ${record.name}`);
  }
  validateVerificationMaterial(bundle.verificationMaterial, bundle.mediaType, record.name);
  decodeCanonicalBase64(bundle.dsseEnvelope.signatures[0].sig, `DSSE signature for ${record.name}`);
  const statement = decodeBase64Json(bundle.dsseEnvelope.payload, `provenance statement for ${record.name}`);
  if (statement._type !== "https://in-toto.io/Statement/v1"
    || statement.predicateType !== attestation.predicateType
    || !Array.isArray(statement.subject) || statement.subject.length !== 1
    || !isObject(statement.subject[0]) || !isObject(statement.subject[0].digest)
    || statement.subject[0].digest.sha512 !== expectedSha512(record.integrity)) {
    fail(`Provenance subject mismatch for ${record.name}`);
  }
  if (!statementHasExpectedSource(statement, expectedRepository, manifest.sourceRevision)) {
    fail(`Provenance source mismatch for ${record.name}`);
  }
}

async function responseJson(response, label) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_REGISTRY_BODY_BYTES) fail(`Oversized ${label}`);
  const reader = response.body?.getReader();
  if (!reader) fail(`Malformed ${label}`);
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_REGISTRY_BODY_BYTES) {
      await reader.cancel();
      fail(`Oversized ${label}`);
    }
    chunks.push(value);
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!isObject(parsed)) fail(`Malformed ${label}`);
    return parsed;
  } catch {
    fail(`Malformed ${label}`);
  }
}

async function createRegistryClient(fixturePath) {
  if (!fixturePath) {
    return async (url, label, attempts) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        let response;
        try {
          response = await fetch(url, {
            headers: { accept: "application/json" },
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          response = undefined;
        }
        if (response?.status === 200) return responseJson(response, label);
        if (response?.status === 404) fail(`${label} is missing`);
        if (response && response.status !== 429 && response.status < 500) fail(`Indeterminate Registry status ${response.status} for ${label}`);
        if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      fail(`${label} did not become visible`);
    };
  }
  const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), fixturePath), "utf8"));
  if (!isObject(fixture) || !isObject(fixture.responses)) fail("Malformed Registry fixture");
  const positions = new Map();
  return async (url, label, attempts) => {
    const configured = fixture.responses[url];
    const responses = Array.isArray(configured) ? configured : [configured];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const position = positions.get(url) ?? 0;
      const response = responses[Math.min(position, responses.length - 1)];
      positions.set(url, position + 1);
      if (isObject(response) && response.status === 200 && isObject(response.body)
        && Buffer.byteLength(JSON.stringify(response.body)) <= MAX_REGISTRY_BODY_BYTES) return response.body;
      if (isObject(response) && response.status === 404) fail(`${label} is missing`);
      if (isObject(response) && typeof response.status === "number"
        && response.status !== 429 && response.status < 500) fail(`Indeterminate Registry status ${response.status} for ${label}`);
    }
    fail(`${label} did not become visible`);
  };
}

async function registryVersion(record, getJson) {
  const encodedName = encodeURIComponent(record.name).replace(/^%40/, "@");
  const url = `${REGISTRY_ORIGIN}/${encodedName}/${encodeURIComponent(record.version)}`;
  return getJson(url, `Registry metadata for ${record.name}`, 10);
}

async function main() {
  const candidateArgument = argument("--candidate");
  const requestedVersion = argument("--version");
  if (!candidateArgument || requestedVersion !== contract.version) fail("Exact --candidate and --version 0.9.2 are required");
  const fixtureArgument = argument("--registry-fixture");
  const npmCommandFixtureArgument = argument("--npm-command-fixture");
  if (npmCommandFixtureArgument && !fixtureArgument) fail("--npm-command-fixture requires --registry-fixture");
  const npmCommandFixture = npmCommandFixtureArgument
    ? await realpath(path.resolve(process.cwd(), npmCommandFixtureArgument))
    : undefined;
  if (process.argv.includes("--metadata-only") && !fixtureArgument) fail("--metadata-only requires --registry-fixture");
  const getJson = await createRegistryClient(fixtureArgument);
  const manifest = JSON.parse(await readFile(path.resolve(process.cwd(), candidateArgument), "utf8"));
  const repositoryPackage = JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "package.json"), "utf8"));
  const expectedRepository = normalizeRepository(repositoryPackage.repository?.url);
  if (!expectedRepository) fail("Expected repository context is invalid");
  for (const record of manifest.packages) {
    const body = await registryVersion(record, getJson);
    if (body.name !== record.name || body.version !== record.version
      || body.dist?.integrity !== record.integrity
      || body.miniagentRelease?.sourceRevision !== manifest.sourceRevision
      || body.miniagentRelease?.candidateId !== manifest.candidateId) {
      fail(`Registry identity mismatch for ${record.name}`);
    }
    if (process.argv.includes("--require-provenance")) {
      const attestationUrl = body.dist?.attestations?.url;
      let parsedUrl;
      try {
        parsedUrl = new URL(attestationUrl);
      } catch {
        fail(`Registry provenance attestation is missing for ${record.name}`);
      }
      if (parsedUrl.origin !== REGISTRY_ORIGIN || parsedUrl.username || parsedUrl.password
        || !parsedUrl.pathname.startsWith("/-/npm/v1/attestations/") || parsedUrl.search || parsedUrl.hash) {
        fail(`Registry provenance attestation URL is invalid for ${record.name}`);
      }
      validateProvenance(
        await getJson(attestationUrl, `Registry provenance attestation for ${record.name}`, 3),
        record,
        manifest,
        expectedRepository,
      );
    }
  }

  if (process.argv.includes("--metadata-only")) {
    console.log(JSON.stringify({
      candidateId: manifest.candidateId,
      provenanceStatement: "identity-bound",
      cryptographicVerification: "not-performed",
    }, null, 2));
    return;
  }

  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-registry-consumer-"));
  const configRoot = await mkdtemp(path.join(os.tmpdir(), "miniagent-registry-config-"));
  try {
    const userConfig = path.join(configRoot, "empty.npmrc");
    const globalConfig = path.join(configRoot, "empty-global.npmrc");
    const cache = path.join(configRoot, "cache");
    await writeFile(userConfig, "");
    await writeFile(globalConfig, "");
    await mkdir(cache);
    await writeFile(path.join(consumerRoot, "package.json"), `${JSON.stringify({
      name: "miniagent-registry-smoke",
      version: "1.0.0",
      private: true,
      type: "module",
    }, null, 2)}\n`);
    const env = npmEnvironment(
      await realpath(userConfig),
      await realpath(globalConfig),
      await realpath(cache),
    );
    const runNpm = (arguments_, options = {}) => execFileSync(
      npmCommandFixture ? process.execPath : "npm",
      npmCommandFixture ? [npmCommandFixture, ...arguments_] : arguments_,
      { cwd: consumerRoot, env, ...options },
    );
    runNpm([
      "install", "--strict-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund",
      `@piaoxianguo/miniagent-engine@${contract.version}`,
      `@piaoxianguo/miniagent-extensions@${contract.version}`,
    ], { stdio: "pipe" });
    const tree = JSON.parse(runNpm(["ls", "--all", "--json"], { encoding: "utf8" }));
    const engine = tree.dependencies?.["@piaoxianguo/miniagent-engine"];
    const extensions = tree.dependencies?.["@piaoxianguo/miniagent-extensions"];
    const installedCore = JSON.parse(await readFile(path.join(
      consumerRoot,
      "node_modules",
      "@piaoxianguo",
      "miniagent-core",
      "package.json",
    ), "utf8"));
    if (installedCore.version !== contract.version
      || engine?.dependencies?.["@piaoxianguo/miniagent-core"]?.version !== contract.version
      || extensions?.dependencies?.["@piaoxianguo/miniagent-core"]?.version !== contract.version
      || engine?.dependencies?.["@piaoxianguo/miniagent-extensions"]
      || extensions?.dependencies?.["@piaoxianguo/miniagent-engine"]) {
      fail("Registry consumer did not install core automatically");
    }
    if (npmCommandFixture) {
      console.log(JSON.stringify({ candidateId: manifest.candidateId, registryConsumerNpmFixture: "accepted" }, null, 2));
      return;
    }
    const zodPaths = [];
    for (const packageContract of contract.packages) {
      const packageRoot = path.join(consumerRoot, "node_modules", ...packageContract.name.split("/"));
      const require = createRequire(path.join(packageRoot, "package.json"));
      zodPaths.push(await realpath(require.resolve("zod/package.json")));
    }
    if (new Set(zodPaths).size !== 1) fail("Registry consumer resolved multiple Zod installations");

    const entries = contract.packages.flatMap((packageContract) => Object.keys(packageContract.exports).map((entry) => (
      entry === "." ? packageContract.name : `${packageContract.name}${entry.slice(1)}`
    )));
    await writeFile(path.join(consumerRoot, "runtime.mjs"), `${entries.map((entry, index) => `import * as entry${index} from ${JSON.stringify(entry)};`).join("\n")}
const values = [${entries.map((_, index) => `entry${index}`).join(", ")}];
if (values.some((value) => typeof value !== "object")) process.exit(1);
`);
    execFileSync(process.execPath, [path.join(consumerRoot, "runtime.mjs")], { cwd: consumerRoot, stdio: "pipe" });
    await writeFile(path.join(consumerRoot, "types.ts"), `${entries.map((entry, index) => `import type * as Entry${index} from ${JSON.stringify(entry)};\ntype Probe${index} = keyof typeof Entry${index};`).join("\n")}
export type Probes = [${entries.map((_, index) => `Probe${index}`).join(", ")}];
`);
    await writeFile(path.join(consumerRoot, "tsconfig.json"), `${JSON.stringify({
      compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022", strict: true, noEmit: true, skipLibCheck: false },
      files: ["types.ts"],
    }, null, 2)}\n`);
    const typescriptBin = path.resolve(import.meta.dirname, "..", "node_modules", "typescript", "bin", "tsc");
    execFileSync(process.execPath, [typescriptBin, "--project", path.join(consumerRoot, "tsconfig.json")], { cwd: consumerRoot, stdio: "pipe" });
    console.log(JSON.stringify({ candidateId: manifest.candidateId, entries, zod: path.basename(path.dirname(zodPaths[0])) }, null, 2));
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
    await rm(configRoot, { recursive: true, force: true });
  }
}

await main();
