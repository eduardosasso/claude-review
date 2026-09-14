import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

type Request = {
  id?: number | string;
  method?: string;
  params?: unknown;
};

type Call = {
  name?: unknown;
  arguments?: unknown;
};

type Verdict = "changes-requested" | "clean";

type StructuredOutput = {
  summary: string;
  verdict: Verdict;
};

type Comment = {
  user?: { login?: unknown };
  body?: unknown;
};

const TOOL_NAME = "publish_verdict";
const SUMMARY_LIMIT = 10_000;
const API_VERSION = "2022-11-28";
const RECEIPT_NAME = "claude-review-published";
const METHOD_NOT_FOUND = -32_601;
const INVALID_PARAMS = -32_602;
const CLAUDE_BOT_LOGIN = "claude[bot]";
const CLEAN_LINE = "Verdict: clean";
const CHANGES_REQUESTED_LINE = "Verdict: changes-requested";
const RESERVED_LINES = [CLEAN_LINE, CHANGES_REQUESTED_LINE];
const COMMENTS_PER_PAGE = 100;
const repository: string = process.env.GITHUB_REPOSITORY ?? "";
const pr: string = process.env.PR_NUMBER ?? "";
const head: string = process.env.REVIEW_HEAD ?? "";
const run: string = process.env.GITHUB_RUN_ID ?? "";
const attempt: string = process.env.GITHUB_RUN_ATTEMPT ?? "";
const token: string = process.env.GITHUB_TOKEN ?? "";
const api: string = process.env.GITHUB_API_URL ?? "https://api.github.com";
const marker: string = `Claude review: head=${head} run=${run} attempt=${attempt}`;
const receipt: string = `${process.env.RUNNER_TEMP ?? "/tmp"}/${RECEIPT_NAME}`;
let published = false;

const reply = (id: number | string, result: unknown): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
};

const fail = (id: number | string, code: number, message: string): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
};

const call = (value: unknown): Call =>
  typeof value === "object" && value !== null ? (value as Call) : {};

const fields = (value: unknown): { summary?: unknown; verdict?: unknown } =>
  typeof value === "object" && value !== null
    ? (value as { summary?: unknown; verdict?: unknown })
    : {};

const validVerdict = (value: unknown): value is Verdict =>
  value === "clean" || value === "changes-requested";

const containsReservedText = (summary: string, marker: string): boolean =>
  summary.includes(marker) ||
  summary.split("\n").some((line: string): boolean => RESERVED_LINES.includes(line));

export const parseStructuredOutput = (raw: string): StructuredOutput | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;

  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "summary" || keys[1] !== "verdict") return undefined;

  const { summary, verdict } = fields(value);
  if (typeof summary !== "string" || summary.length === 0 || summary.length > SUMMARY_LIMIT) {
    return undefined;
  }
  if (!validVerdict(verdict)) return undefined;

  return { summary, verdict };
};

export const countOccurrences = (haystack: string, needle: string): number =>
  needle.length === 0 ? 0 : haystack.split(needle).length - 1;

export const countLineMatches = (body: string, target: string): number =>
  body.split("\n").filter((line: string): boolean => line === target).length;

export const verdictCommentIsValid = (
  body: string,
  marker: string,
  expectedVerdict: string,
): boolean => {
  const markerCount = countOccurrences(body, marker);
  const cleanCount = countLineMatches(body, CLEAN_LINE);
  const changesCount = countLineMatches(body, CHANGES_REQUESTED_LINE);
  const verdictCount = cleanCount + changesCount;

  return markerCount === 1 && verdictCount === 1 && countLineMatches(body, expectedVerdict) === 1;
};

const publish = async (value: unknown): Promise<string> => {
  if (published) throw new Error("The Claude verdict is already published.");
  if (!repository || !pr || !head || !run || !attempt || !token) {
    throw new Error("The trusted review context is incomplete.");
  }

  const { summary, verdict } = fields(value);
  if (typeof summary !== "string" || summary.length === 0 || summary.length > SUMMARY_LIMIT) {
    throw new Error("The review summary is invalid.");
  }
  if (!validVerdict(verdict)) throw new Error("The review verdict is invalid.");
  if (containsReservedText(summary, marker)) {
    throw new Error("The review summary contains reserved text.");
  }

  const body: string = `${marker}\n\n${summary}\n\nVerdict: ${verdict}`;
  const response: Response = await fetch(`${api}/repos/${repository}/issues/${pr}/comments`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": API_VERSION,
    },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(`GitHub rejected the Claude review with HTTP ${response.status}.`);
  }

  await writeFile(receipt, marker, "utf8");
  published = true;

  return "The exact-head Claude verdict is published.";
};

const stop = async (): Promise<void> => {
  await Bun.stdin.text();

  const publication: string = await readFile(receipt, "utf8").catch((): string => "");
  if (publication === marker) return;

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "The exact-head verdict is not published. Call mcp__claude_review__publish_verdict exactly once now.",
    }),
  );
};

const fetchIssueComments = async (): Promise<Comment[]> => {
  const comments: Comment[] = [];
  let page = 1;
  for (;;) {
    const response: Response = await fetch(
      `${api}/repos/${repository}/issues/${pr}/comments?per_page=${COMMENTS_PER_PAGE}&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub rejected the comment lookup with HTTP ${response.status}.`);
    }
    const batch = (await response.json()) as Comment[];
    comments.push(...batch);
    if (batch.length < COMMENTS_PER_PAGE) break;
    page += 1;
  }

  return comments;
};

const check = async (): Promise<void> => {
  const raw: string = process.env.REVIEW_OUTPUT ?? "";
  const structured = parseStructuredOutput(raw);
  if (!structured) {
    process.stderr.write("Claude did not return a valid structured review.\n");
    process.exit(1);
  }

  const { summary, verdict } = structured;
  if (containsReservedText(summary, marker)) {
    process.stderr.write("Claude returned reserved review text in its summary.\n");
    process.exit(1);
  }

  const expectedVerdict = `Verdict: ${verdict}`;
  const comments = await fetchIssueComments();
  const marked = comments.filter(
    (comment: Comment): boolean =>
      comment.user?.login === CLAUDE_BOT_LOGIN &&
      typeof comment.body === "string" &&
      comment.body.startsWith(marker),
  );

  const review = typeof marked[0]?.body === "string" ? marked[0].body : "";
  if (marked.length === 1 && verdictCommentIsValid(review, marker, expectedVerdict)) {
    return;
  }

  process.stderr.write(`Claude did not publish exactly one valid verdict for ${head}.\n`);
  process.exit(1);
};

const request = async (value: Request): Promise<void> => {
  if (value.id === undefined) return;
  if (value.method === "initialize") {
    reply(value.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "claude-review", version: "1.0.0" },
    });
    return;
  }
  if (value.method === "ping") {
    reply(value.id, {});
    return;
  }
  if (value.method === "tools/list") {
    reply(value.id, {
      tools: [
        {
          name: TOOL_NAME,
          description: "Publish one exact-head Claude review on the current pull request.",
          inputSchema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                minLength: 1,
                maxLength: SUMMARY_LIMIT,
              },
              verdict: {
                type: "string",
                enum: ["clean", "changes-requested"],
              },
            },
            required: ["summary", "verdict"],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }
  if (value.method !== "tools/call") {
    fail(value.id, METHOD_NOT_FOUND, "Method not found.");
    return;
  }

  const tool: Call = call(value.params);
  if (tool.name !== TOOL_NAME) {
    fail(value.id, INVALID_PARAMS, "Unknown tool.");
    return;
  }

  try {
    const result: string = await publish(tool.arguments);
    reply(value.id, { content: [{ type: "text", text: result }] });
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    reply(value.id, {
      content: [{ type: "text", text: message }],
      isError: true,
    });
  }
};

const main = async (): Promise<void> => {
  const lines = createInterface({ input: process.stdin, terminal: false });
  for await (const line of lines) {
    try {
      await request(JSON.parse(line) as Request);
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Invalid JSON-RPC request: ${message}\n`);
    }
  }
};

if (import.meta.main) {
  if (process.argv[2] === "stop") await stop();
  else if (process.argv[2] === "check") await check();
  else await main();
}
