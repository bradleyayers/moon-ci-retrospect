import * as path from "node:path";
import { $ } from "execa";
import { expect, test } from "vitest";

const indexJs = path.resolve("index.js");

test("basic", async () => {
	const cwd = path.join(import.meta.dirname, "workspaces/basic");
	const { stdout, stderr } = await $({ cwd, reject: false })`node ${indexJs}`;
	expect(stdout).toMatchSnapshot();
	expect(stderr).toMatchInlineSnapshot(`"Some tasks failed. Please check the output above."`);
});

test("no-tasks", async () => {
	const cwd = path.join(import.meta.dirname, "workspaces/no-tasks");
	const { stdout, stderr } = await $({ cwd })`node ${indexJs}`;
	expect(stdout).toMatchSnapshot();
	expect(stderr).toMatchInlineSnapshot(`""`);
});
