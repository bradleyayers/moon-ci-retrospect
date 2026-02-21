import * as path from "node:path";
import { $ } from "execa";
import { expect, test } from "vitest";
import { formatDuration, renderHistogram } from "../index.js";

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

test("renderHistogram", () => {
	// Edge case: zero max duration
	expect(renderHistogram({ secs: 0, nanos: 0 }, 0)).toBe("     ");

	// 0% (0ms / 100ms = 0%)
	expect(renderHistogram({ secs: 0, nanos: 0 }, 100)).toBe("     ");

	// 12.5% (12.5ms / 100ms) → 62.5% through first slot
	expect(renderHistogram({ secs: 0, nanos: 12_500_000 }, 100)).toBe("⣧⠀⠀⠀⠀");

	// 20% (20ms / 100ms) → exactly one full slot
	expect(renderHistogram({ secs: 0, nanos: 20_000_000 }, 100)).toBe("⣿⠀⠀⠀⠀");

	// 25% (25ms / 100ms) → 1.25 slots filled
	expect(renderHistogram({ secs: 0, nanos: 25_000_000 }, 100)).toBe("⣿⣄⠀⠀⠀");

	// 40% (40ms / 100ms) → 2 full slots
	expect(renderHistogram({ secs: 0, nanos: 40_000_000 }, 100)).toBe("⣿⣿⠀⠀⠀");

	// 50% (50ms / 100ms) → 2.5 slots filled
	expect(renderHistogram({ secs: 0, nanos: 50_000_000 }, 100)).toBe("⣿⣿⣇⠀⠀");

	// 60% (60ms / 100ms) → 3 full slots
	expect(renderHistogram({ secs: 0, nanos: 60_000_000 }, 100)).toBe("⣿⣿⣿⠀⠀");

	// 75% (75ms / 100ms) → 3.75 slots filled
	expect(renderHistogram({ secs: 0, nanos: 75_000_000 }, 100)).toBe("⣿⣿⣿⣷⠀");

	// 80% (80ms / 100ms) → 4 full slots
	expect(renderHistogram({ secs: 0, nanos: 80_000_000 }, 100)).toBe("⣿⣿⣿⣿⠀");

	// 100% (100ms / 100ms) → all 5 slots full
	expect(renderHistogram({ secs: 0, nanos: 100_000_000 }, 100)).toBe("⣿⣿⣿⣿⣿");

	// 27% (27ms / 100ms) → 1.35 slots → slot 1 gets 35% = level 3
	expect(renderHistogram({ secs: 0, nanos: 27_000_000 }, 100)).toBe("⣿⣆⠀⠀⠀");

	// 34% (34ms / 100ms) → 1.7 slots → slot 1 gets 70% = level 6
	expect(renderHistogram({ secs: 0, nanos: 34_000_000 }, 100)).toBe("⣿⣷⠀⠀⠀");

	// Different max duration: 1 second with max 2 seconds → 50%
	expect(renderHistogram({ secs: 1, nanos: 0 }, 2000)).toBe("⣿⣿⣇⠀⠀");

	// Very fast task: 5ms with max 100ms → 5% → 0.25 slots = level 2
	expect(renderHistogram({ secs: 0, nanos: 5_000_000 }, 100)).toBe("⣄⠀⠀⠀⠀");

	// Slowest task compared to itself → 100%
	expect(renderHistogram({ secs: 0, nanos: 34_000_000 }, 34)).toBe("⣿⣿⣿⣿⣿");
});

