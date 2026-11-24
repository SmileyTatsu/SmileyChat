/**
 * Publishes (or verifies) the generated plugin API typings.
 *
 * `dts-bundle-generator` emits the declarations but has no banner option, and a
 * hand-maintained copy of this API drifted from the runtime twice already.
 * `bun run plugin-types` regenerates the raw declarations into
 * `types/.generated.d.ts` and this script labels them as generated.
 *
 * `--check` compares instead of writing, so CI fails when the committed file no
 * longer matches `src/lib/plugins/types.ts`. It compares file contents rather
 * than running `git diff`, because a git-based check passes silently for an
 * untracked, ignored or freshly deleted file.
 */
import { readFile, rm, writeFile } from "node:fs/promises";

const SOURCE = "types/.generated.d.ts";
const OUTPUT = "types/smileychat-plugin-api.d.ts";

const HEADER = `/**
 * SmileyChat plugin API typings.
 *
 * GENERATED FILE - do not edit. Run \`bun run plugin-types\` in the SmileyChat
 * repo to regenerate it from \`src/lib/plugins/types.ts\`; CI fails when this
 * file is out of date, so a published type can never drift from the runtime.
 *
 * \`preact\` is the only external dependency: the types reference its
 * ComponentChildren and VNode. Add it as a dev dependency when you typecheck a
 * plugin against this file.
 */
`;

const checkOnly = process.argv.includes("--check");
const generated = await readFile(SOURCE, "utf8");
const next = `${HEADER}\n${generated}`;

await rm(SOURCE, { force: true });

if (!checkOnly) {
    await writeFile(OUTPUT, next, "utf8");
    console.log(`Wrote ${OUTPUT}`);
    process.exit(0);
}

const current = await readFile(OUTPUT, "utf8").catch(() => "");

if (current === next) {
    console.log(`${OUTPUT} is up to date.`);
    process.exit(0);
}

console.error(
    `${OUTPUT} is out of date.\n` +
        "Run `bun run plugin-types` in the SmileyChat repo and commit the result.\n" +
        `Expected ${next.length} characters, found ${current.length}.`,
);
process.exit(1);
