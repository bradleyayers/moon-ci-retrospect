import { readFile, stat } from "node:fs/promises";

async function main(): Promise<boolean> {
	let anyErrors = false;

	const workspaceRoot = await getWorkspaceRoot();
	const ciReport = await readCiReport(workspaceRoot);
	if (!ciReport) {
		console.log("CI report file does not exist. No CI tasks may have been executed.");
		return anyErrors;
	}

	// First pass: collect tasks and find max duration
	const taskActions: Array<{ action: Action; taskInfo: TaskInfo }> = [];
	let maxDurationMs = 0;

	for (const action of ciReport.actions) {
		const taskInfo = taskInfoOf(action);
		if (!taskInfo) {
			continue;
		}
		taskActions.push({ action, taskInfo });
		if (taskInfo.status !== "skipped") {
			const durationMs = taskInfo.duration.secs * 1000 + taskInfo.duration.nanos / 1_000_000;
			maxDurationMs = Math.max(maxDurationMs, durationMs);
		}
	}

	// Second pass: display tasks with histograms
	for (const { taskInfo } of taskActions) {
		const { stdout, stderr } = await readStatus({ workspaceRoot, taskInfo });
		const { project, task, command, status, duration } = taskInfo;
		anyErrors = anyErrors || status === "failed";
		const target = `${project}:${task}`;
		const histogram = ` ${status === "skipped" ? renderSkippedHistogram() : renderHistogram(duration, maxDurationMs)}`;
		const durationStr = status !== "skipped" ? ` ${gray(`(${formatDuration(duration)}`)}` : "";
		writeGroup(`${statusBadges[status]}${histogram} ${bold(target)}${durationStr}`, ({ println }) => {
			if (command) {
				println(blue(`$ ${command}`));
			}
			const hasStdout = stdout.trim() !== "";
			const hasStderr = stderr.trim() !== "";
			if (hasStdout) {
				println(stdoutBadge);
				println(stdout);
			}
			if (hasStderr) {
				println(stderrBadge);
				println(stderr);
			}
		});
	}
	return anyErrors;
}

async function getWorkspaceRoot(): Promise<string> {
	return process.cwd();
}

async function readCiReport(workspaceRoot: string): Promise<CiReport | undefined> {
	const ciReportPath = `${workspaceRoot}/.moon/cache/ciReport.json`;
	if (!(await fileExists(ciReportPath))) {
		return;
	}
	const ciReportFile = await readFileContent(ciReportPath);
	return JSON.parse(ciReportFile) as CiReport;
}

function taskInfoOf(action: Action): undefined | TaskInfo {
	if (action.node.action !== "run-task") {
		return undefined;
	}
	const { project, task } = parseTarget(action.node.params.target);
	return {
		project,
		task,
		command: commandOf(action),
		status: action.status,
		duration: action.duration,
	};
}

type TaskInfo = {
	project: string;
	task: string;
	command: undefined | string;
	status: "failed" | "passed" | "skipped";
	duration: { secs: number; nanos: number };
};

function parseTarget(target: string): { project: string; task: string } {
	const parts = target.split(":");
	const project = parts[0] ?? "unknown";
	const task = parts[1] ?? "unknown";
	return { project, task };
}

function commandOf(action: Action): string | undefined {
	for (const operation of action.operations) {
		if (operation.meta.type === "task-execution") {
			return operation.meta.command;
		}
	}
	return undefined;
}

async function readStatus({
	workspaceRoot,
	taskInfo,
}: { workspaceRoot: string; taskInfo: TaskInfo }): Promise<{ stdout: string; stderr: string }> {
	const { project, task } = taskInfo;
	const statusDir = `${workspaceRoot}/.moon/cache/states/${project}/${task}`;
	const stdoutPath = `${statusDir}/stdout.log`;
	const stderrPath = `${statusDir}/stderr.log`;
	const stdout = (await fileExists(stdoutPath)) ? await readFileContent(stdoutPath) : "";
	const stderr = (await fileExists(stderrPath)) ? await readFileContent(stderrPath) : "";
	return { stdout, stderr };
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function readFileContent(path: string): Promise<string> {
	return await readFile(path, { encoding: "utf8" });
}

function writeGroup(title: string, inner: (params: { println: (output: string) => void }) => void): void {
	console.log(`::group::${title}`);
	inner({
		println(output) {
			console.log(output);
		},
	});
	console.log("::endgroup::");
}

const statusBadges: Record<Action["status"], string> = {
	passed: bgGreen(" PASS "),
	failed: bgRed(" FAIL "),
	skipped: bgBlue(" SKIP "),
};

function bgGreen(text: string): string {
	return `\u001b[42m${text}\u001b[49m`;
}

function bgRed(text: string): string {
	return `\u001b[41m${text}\u001b[49m`;
}

function bgBlue(text: string): string {
	return `\u001b[44m${text}\u001b[49m`;
}

function bgDarkGray(text: string): string {
	return `\u001b[48;5;236m${text}\u001b[49m`;
}

function bold(text: string): string {
	return `\u001b[1m${text}\u001b[22m`;
}

function green(text: string): string {
	return `\u001b[32m${text}\u001b[39m`;
}

function red(text: string): string {
	return `\u001b[31m${text}\u001b[39m`;
}

function blue(text: string): string {
	return `\u001b[34m${text}\u001b[39m`;
}

function gray(text: string): string {
	return `\u001b[38;5;240m${text}\u001b[39m`;
}

function formatDuration(duration: { secs: number; nanos: number }): string {
	const totalMs = duration.secs * 1000 + duration.nanos / 1_000_000;
	let seconds = Math.floor(totalMs / 1000);
	let milliseconds = Math.round(totalMs % 1000);
	// Handle overflow when rounding milliseconds up to 1000
	if (milliseconds === 1000) {
		seconds += 1;
		milliseconds = 0;
	}

	// If >= 60 seconds, show minutes and seconds
	if (seconds >= 60) {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s)`;
	}

	// If < 60 seconds, show seconds and milliseconds
	if (seconds === 0) {
		return `${milliseconds}ms)`;
	}
	return `${seconds}s ${milliseconds}ms)`;
}

function renderHistogram(duration: { secs: number; nanos: number }, maxDurationMs: number): string {
	const durationMs = duration.secs * 1000 + duration.nanos / 1_000_000;
	if (maxDurationMs === 0) {
		return gray("⣿⣿⣿⣿⣿");
	}
	const percentage = (durationMs / maxDurationMs) * 100;
	const barWidth = 5;
	const fillLevel = (percentage / 100) * barWidth; // 0-5

	const brailleColumns = [" ", "⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣷", "⣿"];
	let bar = "";

	for (let i = 0; i < barWidth; i++) {
		if (fillLevel <= i) {
			bar += gray("⣿");
			continue;
		}
		if (fillLevel >= i + 1) {
			bar += "⣿";
			continue;
		}
		const partialFill = (fillLevel - i) * 8;
		const level = Math.max(1, Math.round(partialFill));
		bar += brailleColumns[level]!;
	}

	return bar;
}

function renderSkippedHistogram(): string {
	return gray("⣿⣿⣿⣿⣿");
}

// Export for testing purposes
export { formatDuration, renderHistogram };

const stdoutBadge = bgDarkGray(`　${green("⏺")} STDOUT　`);
const stderrBadge = bgDarkGray(`　${red("⏺")} STDERR　`);

type CiReport = {
	actions: Action[];
};

type Action = {
	label: string;
	nodeIndex: number;
	status: "failed" | "passed" | "skipped";
	node: Node;
	operations: Operation[];
	duration: { secs: number; nanos: number };
};

type Node =
	| {
		action: "run-task";
		params: {
			target: string;
		};
	}
	| {
		action: "sync-workspace" | "setup-tool" | "install-deps" | "sync-project" | "install-project-deps";
	};

type Operation = {
	meta: Meta;
};

type Meta =
	| {
		type: "task-execution";
		command: string;
	}
	| {
		type: "archive-creation" | "hash-generation" | "no-operation" | "output-hydration";
	};

let anyErrors;

try {
	anyErrors = await main();
} catch (error) {
	console.error(error);
	process.exit(0);
}

if (anyErrors === true) {
	console.error("Some tasks failed. Please check the output above.");
	process.exit(1);
}
