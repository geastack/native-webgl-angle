import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createIdentityTable } from '@geastack/compiler/dist/semantics/normalize/identities.js'
import { indexValueFlow } from '@geastack/compiler/dist/semantics/normalize/flow/value-flow.js'
import { censusGlobalHostMutations } from '@geastack/compiler/dist/semantics/normalize/global-host-mutations.js'
import { censusUnresolvableNames } from '@geastack/compiler/dist/semantics/normalize/unresolvable-names.js'
import { wholeProgram } from '@geastack/compiler/dist/semantics/normalize/reachability.js'
import { createRequire } from 'node:module'
import { nativeTestOutDir } from "./out-dir.mjs";

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')

const lifecycle = new Set([
  "threeWebGLAttach",
  "threeWebGLSyncSize",
  "threeWebGLSwap",
]);
const declarations = [];
for (const name of ["nativeWebGLHost.ts", "nativeAudioHost.ts"]) {
  const path = resolve(import.meta.dirname, "../src", name);
  const file = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const declaration of file.statements) {
    if (
      !ts.isFunctionDeclaration(declaration) ||
      declaration.body ||
      !declaration.name
    )
      continue;
    const tagged = ts
      .getJSDocTags(declaration)
      .some((tag) => tag.tagName.text === "gea-host-inert");
    if (lifecycle.has(declaration.name.text)) {
      assert.equal(
        tagged,
        false,
        `${declaration.name.text} requires a separate lifecycle-effect audit`,
      );
      continue;
    }
    assert.equal(
      tagged,
      true,
      `${declaration.name.text} must state its audited native effect contract`,
    );
    const argumentsList = declaration.parameters.map((parameter) => {
      if (parameter.type?.kind === ts.SyntaxKind.NumberKeyword) return "1";
      if (parameter.type?.kind === ts.SyntaxKind.StringKeyword)
        return "'sample'";
      if (parameter.type?.getText(file) === "Float32Array")
        return "new Float32Array([1, 2])";
      assert.fail(
        `Audit the new input of ${declaration.name.text}: ${parameter.getText(file)}`,
      );
    });
    declarations.push({
      name: declaration.name.text,
      source: declaration.getFullText(file),
      call: `${declaration.name.text}(${argumentsList.join(", ")});`,
    });
  }
}

// A label for the generated source below, not a file on disk.
const entry = join(nativeTestOutDir(), "native-host-effects.ts");
function audit(withoutContract = null) {
  const source = `export {};\n${declarations
    .map((declaration) =>
      declaration.name === withoutContract
        ? declaration.source.replace(
            "@gea-host-inert",
            "Unaudited native boundary",
          )
        : declaration.source,
    )
    .join(
      "\n",
    )}\n${declarations.map((declaration) => declaration.call).join("\n")}`;
  const options = { target: ts.ScriptTarget.ES2022, strict: true, types: [] };
  const host = ts.createCompilerHost(options, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, ...rest) =>
    name === entry
      ? ts.createSourceFile(name, source, version, true)
      : read(name, version, ...rest);
  const program = ts.createProgram([entry], options, host);
  assert.deepEqual(
    program
      .getSemanticDiagnostics()
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    [],
  );
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(entry);
  const identities = createIdentityTable(program, checker);
  return censusGlobalHostMutations(
    checker,
    identities,
    [file],
    censusUnresolvableNames(checker, [file]),
    new Set(),
    indexValueFlow(checker, [file], wholeProgram),
    wholeProgram,
  );
}

assert.deepEqual(
  [...audit()],
  [],
  "native-only effects must not invalidate JavaScript prototype assumptions",
);
for (const name of ["threeWebGLBindBuffer", "threeAudioBufferChannelData"]) {
  assert.notDeepEqual(
    [...audit(name)],
    [],
    `removing ${name}'s contract must restore conservative prototype reachability`,
  );
}
console.log(
  `PASS ${declarations.length} actual native host declarations retain intrinsic trust; missing-contract controls refuse`,
);
