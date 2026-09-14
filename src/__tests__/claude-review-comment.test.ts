import { describe, expect, test } from "bun:test";
import {
  countLineMatches,
  countOccurrences,
  parseStructuredOutput,
  verdictCommentIsValid,
} from "../../bin/claude-review-comment";

describe("parseStructuredOutput", () => {
  test("accepts a valid clean verdict", () => {
    const raw = JSON.stringify({ summary: "Looks good.", verdict: "clean" });

    expect(parseStructuredOutput(raw)).toEqual({ summary: "Looks good.", verdict: "clean" });
  });

  test("rejects invalid JSON", () => {
    expect(parseStructuredOutput("not json")).toBeUndefined();
  });

  test("rejects an unknown verdict", () => {
    const raw = JSON.stringify({ summary: "x", verdict: "maybe" });

    expect(parseStructuredOutput(raw)).toBeUndefined();
  });

  test("rejects extra keys", () => {
    const raw = JSON.stringify({ summary: "x", verdict: "clean", extra: true });

    expect(parseStructuredOutput(raw)).toBeUndefined();
  });

  test("rejects an empty summary", () => {
    const raw = JSON.stringify({ summary: "", verdict: "clean" });

    expect(parseStructuredOutput(raw)).toBeUndefined();
  });
});

describe("countOccurrences", () => {
  test("counts non-overlapping matches", () => {
    expect(countOccurrences("aXaXa", "a")).toBe(3);
  });

  test("returns zero for no match", () => {
    expect(countOccurrences("abc", "z")).toBe(0);
  });
});

describe("countLineMatches", () => {
  test("counts exact line matches only", () => {
    const body = "Verdict: clean\nsome text Verdict: clean here\nVerdict: clean";

    expect(countLineMatches(body, "Verdict: clean")).toBe(2);
  });
});

describe("verdictCommentIsValid", () => {
  const marker = "Claude review: head=abc run=1 attempt=1";

  test("accepts one marker and one matching verdict line", () => {
    const body = `${marker}\n\nAll good.\n\nVerdict: clean`;

    expect(verdictCommentIsValid(body, marker, "Verdict: clean")).toBe(true);
  });

  test("rejects a mismatched verdict", () => {
    const body = `${marker}\n\nAll good.\n\nVerdict: clean`;

    expect(verdictCommentIsValid(body, marker, "Verdict: changes-requested")).toBe(false);
  });

  test("rejects a duplicated marker", () => {
    const body = `${marker}\n${marker}\n\nVerdict: clean`;

    expect(verdictCommentIsValid(body, marker, "Verdict: clean")).toBe(false);
  });

  test("rejects two verdict lines", () => {
    const body = `${marker}\n\nVerdict: clean\nVerdict: changes-requested`;

    expect(verdictCommentIsValid(body, marker, "Verdict: clean")).toBe(false);
  });
});
