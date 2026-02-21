import * as path from "node:path";
import { $ } from "execa";
import { expect, test } from "vitest";
import { formatDuration } from "../index.js";

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

test("formatDuration", () => {
	// Zero duration
	expect(formatDuration({ secs: 0, nanos: 0 })).toBe("0ms)");

	// Fractional milliseconds
	expect(formatDuration({ secs: 0, nanos: 1_000_000 })).toBe("1ms)");
	expect(formatDuration({ secs: 0, nanos: 9_000_000 })).toBe("9ms)");
	expect(formatDuration({ secs: 0, nanos: 10_000_000 })).toBe("10ms)");
	expect(formatDuration({ secs: 0, nanos: 99_000_000 })).toBe("99ms)");
	expect(formatDuration({ secs: 0, nanos: 100_000_000 })).toBe("100ms)");
	expect(formatDuration({ secs: 0, nanos: 999_000_000 })).toBe("999ms)");

	// Exactly 1 second
	expect(formatDuration({ secs: 1, nanos: 0 })).toBe("1s 0ms)");

	// Multiple seconds with milliseconds
	expect(formatDuration({ secs: 1, nanos: 500_000_000 })).toBe("1s 500ms)");
	expect(formatDuration({ secs: 2, nanos: 50_000_000 })).toBe("2s 50ms)");
	expect(formatDuration({ secs: 10, nanos: 5_000_000 })).toBe("10s 5ms)");

	// From real test data: 27.328ms
	expect(formatDuration({ secs: 0, nanos: 27_328_000 })).toBe("27ms)");

	// Fractional edge cases
	expect(formatDuration({ secs: 0, nanos: 500_000 })).toBe("1ms)"); // 0.5ms rounds up
	expect(formatDuration({ secs: 0, nanos: 999_999 })).toBe("1ms)"); // <1ms rounds up
	expect(formatDuration({ secs: 0, nanos: 999_500_000 })).toBe("1s 0ms)"); // 999.5ms rounds to 1000ms = 1s
});

