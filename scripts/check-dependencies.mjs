import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const LAYERS = new Set(["core", "engine", "extensions", "cli"]);
const ALLOWED_LAYERS = {
    core: new Set(["core"]),
    engine: new Set(["core", "engine"]),
    extensions: new Set(["core", "extensions"]),
    cli: new Set(["core", "engine", "extensions", "cli"]),
    public: new Set(["core", "engine", "extensions", "cli", "public"]),
};
const EXTERNAL_ALLOWLIST = {
    core: ["zod", "eventemitter3"],
    engine: ["zod", "zod-to-json-schema", "openai", "@anthropic-ai/sdk"],
    extensions: ["zod", "json5", "yaml", "@modelcontextprotocol/sdk"],
    cli: null,
    public: [],
};
const PUBLIC_ENTRIES = {
    core: "core/index.ts",
    engine: "engine/index.ts",
    extensions: "extensions/index.ts",
    cli: "cli/public.ts",
};

function parseRootArg(argv) {
    const index = argv.indexOf("--root");
    if (index === -1) {
        return path.resolve("src");
    }
    const value = argv[index + 1];
    if (value === undefined) {
        throw new Error("--root requires a directory");
    }
    return path.resolve(value);
}

function walk(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walk(filePath));
        } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
            files.push(filePath);
        }
    }
    return files;
}

function layerOf(root, filePath) {
    const relative = path.relative(root, filePath);
    if (relative === "index.ts" || relative === "index.tsx" || relative === "index.test.ts") {
        return "public";
    }
    const [layer] = relative.split(path.sep);
    return LAYERS.has(layer) ? layer : null;
}

function collectSpecifiers(filePath) {
    const source = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const specifiers = [];
    function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
            && node.moduleSpecifier !== undefined
            && ts.isStringLiteral(node.moduleSpecifier)) {
            specifiers.push(node.moduleSpecifier.text);
        } else if (ts.isCallExpression(node)
            && node.expression.kind === ts.SyntaxKind.ImportKeyword
            && node.arguments.length === 1
            && ts.isStringLiteral(node.arguments[0])) {
            specifiers.push(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    return specifiers;
}

function resolveRelative(importer, specifier) {
    const raw = path.resolve(path.dirname(importer), specifier);
    const candidates = specifier.endsWith(".js")
        ? [raw.slice(0, -3) + ".ts", raw.slice(0, -3) + ".tsx"]
        : [raw, `${raw}.ts`, `${raw}.tsx`, path.join(raw, "index.ts"), path.join(raw, "index.tsx")];
    return candidates.find((candidate) => fs.existsSync(candidate));
}

function externalPackage(specifier) {
    if (specifier.startsWith("node:")) {
        return "node:";
    }
    const parts = specifier.split("/");
    return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isExternalAllowed(layer, specifier, importer) {
    if (/\.test\.tsx?$/.test(importer) && specifier === "vitest") {
        return true;
    }
    if (specifier.startsWith("node:")) {
        return layer !== "core" || /\.test\.tsx?$/.test(importer);
    }
    const allowlist = EXTERNAL_ALLOWLIST[layer];
    if (allowlist === null) {
        return true;
    }
    return allowlist.some((allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`));
}

function stronglyConnectedComponents(nodes, edges) {
    let nextIndex = 0;
    const indices = new Map();
    const lowLinks = new Map();
    const stack = [];
    const onStack = new Set();
    const components = [];

    function visit(node) {
        indices.set(node, nextIndex);
        lowLinks.set(node, nextIndex);
        nextIndex += 1;
        stack.push(node);
        onStack.add(node);

        for (const target of edges.get(node) ?? []) {
            if (!indices.has(target)) {
                visit(target);
                lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(target)));
            } else if (onStack.has(target)) {
                lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(target)));
            }
        }

        if (lowLinks.get(node) === indices.get(node)) {
            const component = [];
            let current;
            do {
                current = stack.pop();
                onStack.delete(current);
                component.push(current);
            } while (current !== node);
            components.push(component);
        }
    }

    for (const node of nodes) {
        if (!indices.has(node)) {
            visit(node);
        }
    }
    return components;
}

export function checkDependencies(root) {
    if (!fs.existsSync(root)) {
        return [`source root does not exist: ${root}`];
    }
    const files = walk(root).map((file) => path.resolve(file));
    const knownFiles = new Set(files);
    const edges = new Map(files.map((file) => [file, new Set()]));
    const errors = [];

    for (const file of files) {
        const layer = layerOf(root, file);
        const relativeFile = path.relative(root, file);
        if (layer === null) {
            errors.push(`unknown source layer: ${relativeFile}`);
            continue;
        }

        for (const specifier of collectSpecifiers(file)) {
            if (!specifier.startsWith(".")) {
                if (!isExternalAllowed(layer, specifier, file)) {
                    errors.push(`forbidden external dependency: ${relativeFile} -> ${externalPackage(specifier)}`);
                }
                continue;
            }

            const target = resolveRelative(file, specifier);
            if (target === undefined) {
                errors.push(`unresolved relative dependency: ${relativeFile} -> ${specifier}`);
                continue;
            }
            if (!knownFiles.has(target)) {
                if (/\.test\.tsx?$/.test(file)) {
                    continue;
                }
                errors.push(`dependency leaves source root: ${relativeFile} -> ${specifier}`);
                continue;
            }
            edges.get(file).add(target);
            const targetLayer = layerOf(root, target);
            if (targetLayer === null) {
                errors.push(`dependency targets unknown layer: ${relativeFile} -> ${path.relative(root, target)}`);
                continue;
            }
            if (!ALLOWED_LAYERS[layer].has(targetLayer)) {
                errors.push(`forbidden layer dependency: ${relativeFile} (${layer}) -> ${path.relative(root, target)} (${targetLayer})`);
            }
            if (layer !== targetLayer && targetLayer !== "public") {
                const expectedEntry = path.join(root, PUBLIC_ENTRIES[targetLayer]);
                if (target !== expectedEntry) {
                    errors.push(`cross-layer deep import: ${relativeFile} -> ${path.relative(root, target)}; use ${PUBLIC_ENTRIES[targetLayer]}`);
                }
            }
        }
    }

    for (const component of stronglyConnectedComponents(files, edges)) {
        const selfCycle = component.length === 1 && edges.get(component[0])?.has(component[0]);
        if (component.length > 1 || selfCycle) {
            errors.push(`circular dependency: ${component.map((file) => path.relative(root, file)).sort().join(" -> ")}`);
        }
    }
    return errors.sort();
}

if (process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = parseRootArg(process.argv.slice(2));
    const errors = checkDependencies(root);
    if (errors.length > 0) {
        for (const error of errors) {
            console.error(error);
        }
        process.exitCode = 1;
    } else {
        console.log(`dependency architecture valid: ${path.relative(process.cwd(), root) || "."}`);
    }
}
