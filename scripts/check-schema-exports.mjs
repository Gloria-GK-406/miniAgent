#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIPPED_DIRECTORIES = new Set([".git", "dist", "node_modules"]);
const ZOD_DERIVATION_NAMES = new Set(["infer", "input", "output"]);

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

async function collectSourceFiles(targets) {
  const files = [];

  async function visit(target) {
    const targetStat = await stat(target);
    if (targetStat.isFile()) {
      if (isSourceFile(target)) files.push(path.resolve(target));
      return;
    }

    if (!targetStat.isDirectory()) return;
    const entries = await readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
      await visit(path.join(target, entry.name));
    }
  }

  for (const target of targets) await visit(path.resolve(target));
  return [...new Set(files)].sort();
}

function hasExportModifier(node) {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function collectZodBindings(sourceFile) {
  const customBindings = new Set();
  const namespaceBindings = new Set();
  const derivationBindings = new Map();
  const zodTypeBindings = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "zod"
      || statement.importClause === undefined) {
      continue;
    }

    if (statement.importClause.name !== undefined) {
      namespaceBindings.add(statement.importClause.name.text);
    }

    const bindings = statement.importClause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaceBindings.add(bindings.name.text);
      continue;
    }

    for (const element of bindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      if (importedName === "z") namespaceBindings.add(element.name.text);
      if (importedName === "custom") customBindings.add(element.name.text);
      if (importedName === "ZodType") zodTypeBindings.add(element.name.text);
      if (ZOD_DERIVATION_NAMES.has(importedName)) {
        derivationBindings.set(element.name.text, importedName);
      }
    }
  }

  return { customBindings, derivationBindings, namespaceBindings, zodTypeBindings };
}

function hasZodSchemaBrand(type, checker) {
  if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return false;
  const brand = checker.getPropertyOfType(type, "_zod");
  return brand?.declarations?.some((declaration) => {
    const declarationPath = declaration.getSourceFile().fileName.split(path.sep).join("/");
    return declarationPath.includes("/node_modules/zod/");
  }) ?? false;
}

function isZodDerivedAlias(node, bindings, checker) {
  if (!ts.isTypeReferenceNode(node.type) || node.type.typeArguments?.length !== 1) return false;
  const typeName = node.type.typeName;
  const usesZodDerivation = ts.isQualifiedName(typeName)
    ? ts.isIdentifier(typeName.left)
      && bindings.namespaceBindings.has(typeName.left.text)
      && ZOD_DERIVATION_NAMES.has(typeName.right.text)
    : ts.isIdentifier(typeName)
      && ZOD_DERIVATION_NAMES.has(bindings.derivationBindings.get(typeName.text));

  return usesZodDerivation
    && hasZodSchemaBrand(checker.getTypeFromTypeNode(node.type.typeArguments[0]), checker);
}

function localExportNames(statements) {
  const names = new Set();
  for (const statement of statements) {
    if (!ts.isExportDeclaration(statement)
      || statement.moduleSpecifier !== undefined
      || statement.exportClause === undefined
      || !ts.isNamedExports(statement.exportClause)) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      names.add((element.propertyName ?? element.name).text);
    }
  }
  return names;
}

function declarationDiagnostic(sourceFile, node, name, detail) {
  const start = node.name.getStart(sourceFile);
  const position = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    column: position.character + 1,
    detail,
    filePath: sourceFile.fileName,
    line: position.line + 1,
    name,
  };
}

function nodeDiagnostic(sourceFile, node, name, detail) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    column: position.character + 1,
    detail,
    filePath: sourceFile.fileName,
    line: position.line + 1,
    name,
  };
}

function isZodMember(expression, member, bindings) {
  return (ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && bindings.namespaceBindings.has(expression.expression.text)
    && expression.name.text === member)
    || (member === "custom"
      && ts.isIdentifier(expression)
      && bindings.customBindings.has(expression.text));
}

function isAssertedZodType(typeNode, bindings) {
  if (!ts.isTypeReferenceNode(typeNode)) {
    return false;
  }
  if (ts.isIdentifier(typeNode.typeName)) {
    return bindings.zodTypeBindings.has(typeNode.typeName.text);
  }
  return ts.isIdentifier(typeNode.typeName.left)
    && bindings.namespaceBindings.has(typeNode.typeName.left.text)
    && typeNode.typeName.right.text === "ZodType";
}

function analyzeSourceFile(sourceFile, checker) {
  const zodBindings = collectZodBindings(sourceFile);
  const diagnostics = [];

  function analyzeStatements(statements) {
    const exportedNames = localExportNames(statements);

    for (const statement of statements) {
      if (ts.isModuleDeclaration(statement)) {
        const namespaceIsExported = hasExportModifier(statement) || exportedNames.has(statement.name.text);
        if (namespaceIsExported && statement.body !== undefined) {
          let body = statement.body;
          while (ts.isModuleDeclaration(body) && body.body !== undefined) body = body.body;
          if (ts.isModuleBlock(body)) analyzeStatements(body.statements);
        }
        continue;
      }

      if (!ts.isInterfaceDeclaration(statement)
        && !ts.isEnumDeclaration(statement)
        && !ts.isTypeAliasDeclaration(statement)) {
        continue;
      }

      const name = statement.name.text;
      if (!hasExportModifier(statement) && !exportedNames.has(name)) continue;

      if (ts.isInterfaceDeclaration(statement)) {
        diagnostics.push(declarationDiagnostic(
          sourceFile,
          statement,
          name,
          "exported interface declarations are forbidden; define a Zod schema and export a z.infer/input/output alias",
        ));
      } else if (ts.isEnumDeclaration(statement)) {
        diagnostics.push(declarationDiagnostic(
          sourceFile,
          statement,
          name,
          "exported enum declarations are forbidden; define a Zod enum schema and export a z.infer/input/output alias",
        ));
      } else if (!isZodDerivedAlias(statement, zodBindings, checker)) {
        diagnostics.push(declarationDiagnostic(
          sourceFile,
          statement,
          name,
          "exported type aliases must be declared directly as z.infer, z.input, or z.output from an imported Zod binding",
        ));
      }
    }
  }

  analyzeStatements(sourceFile.statements);

  function analyzeSchemaConstruction(node) {
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node))
      && isAssertedZodType(node.type, zodBindings)) {
      diagnostics.push(nodeDiagnostic(
        sourceFile,
        node,
        "asserted ZodType",
        "ZodType assertions are forbidden because they can replace a Schema's inferred contract with a handwritten structure",
      ));
    }

    if (ts.isCallExpression(node) && isZodMember(node.expression, "custom", zodBindings)) {
      if (node.arguments.length === 0) {
        diagnostics.push(nodeDiagnostic(
          sourceFile,
          node,
          "predicate-free z.custom",
          "z.custom must include a real runtime predicate; use a data Schema, createFunctionSchema, createProtocolSchema, or an opaque-object predicate",
        ));
      }
      const customType = node.typeArguments?.[0];
      if (customType !== undefined && ts.isTypeLiteralNode(customType)) {
        diagnostics.push(nodeDiagnostic(
          sourceFile,
          node,
          "structural z.custom",
          "structural data and service contracts must be described by Zod fields rather than z.custom with a handwritten type literal",
        ));
      }
    }

    ts.forEachChild(node, analyzeSchemaConstruction);
  }

  analyzeSchemaConstruction(sourceFile);

  return diagnostics;
}

export async function checkSchemaExports(targets) {
  const files = await collectSourceFiles(targets);
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  const parsedConfig = configPath === undefined
    ? { options: {} }
    : ts.parseJsonConfigFileContent(
      ts.readConfigFile(configPath, ts.sys.readFile).config,
      ts.sys,
      path.dirname(configPath),
    );
  const options = { ...parsedConfig.options, noEmit: true, skipLibCheck: true };
  const host = ts.createCompilerHost(options);
  host.resolveModuleNameLiterals = (moduleLiterals, containingFile) => moduleLiterals.map((literal) => {
    const direct = ts.resolveModuleName(literal.text, containingFile, options, host).resolvedModule;
    const fallback = direct ?? ts.resolveModuleName(
      literal.text,
      path.join(process.cwd(), "__schema-export-policy__.ts"),
      options,
      host,
    ).resolvedModule;
    return { resolvedModule: fallback };
  });
  const program = ts.createProgram({ rootNames: files, options, host });
  const checker = program.getTypeChecker();
  const diagnostics = [];
  for (const filePath of files) {
    const sourceFile = program.getSourceFile(filePath);
    if (sourceFile === undefined) {
      throw new Error(`TypeScript could not load source file: ${filePath}`);
    }
    diagnostics.push(...analyzeSourceFile(sourceFile, checker));
  }
  return diagnostics;
}

function formatDiagnostic(diagnostic) {
  const displayPath = path.relative(process.cwd(), diagnostic.filePath) || path.basename(diagnostic.filePath);
  return `${displayPath}:${diagnostic.line}:${diagnostic.column} error ${diagnostic.name}: ${diagnostic.detail}`;
}

async function main() {
  const targets = process.argv.slice(2);
  const diagnostics = await checkSchemaExports(targets.length === 0 ? ["src"] : targets);
  if (diagnostics.length === 0) {
    process.stdout.write("Schema export policy passed.\n");
    return;
  }

  process.stderr.write(`${diagnostics.map(formatDiagnostic).join("\n")}\n`);
  process.stderr.write(`Schema export policy failed with ${diagnostics.length} violation(s).\n`);
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Schema export policy could not run: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
