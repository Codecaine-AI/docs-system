/**
 * The shape check every model answer passes before a Rewriter returns it. BAML's lenient parser
 * turns a cut-off reply, a JSON array, or an escaped newline into a plain string, and none of those
 * may become doc text. Both adapters run this check, so tests with the fake see what runs do.
 */
import type { RewriteRequest } from "../types";

/** A model answer with a broken shape. The sweep records it as a failed attempt and retries. */
export class RewriteAnswerError extends Error {
  /** Why the answer was rejected, in one short line. */
  readonly reason: string;

  constructor(model: string, reason: string) {
    super(`${model} answer rejected: ${reason}`);
    this.name = "RewriteAnswerError";
    this.reason = reason;
  }
}

/** Throws RewriteAnswerError when `answer` cannot be a rewrite of the request's block. */
export function checkAnswer(request: RewriteRequest, answer: string, model: string): void {
  const reason = answerProblem(request, answer);
  if (reason) throw new RewriteAnswerError(model, reason);
}

function answerProblem(request: RewriteRequest, answer: string): string | undefined {
  const text = answer.trim();
  const original = request.markdown.trim();
  if (!text) return "the answer is empty";
  if (text.includes("\\n") && !original.includes("\\n")) return "the answer holds a literal \\n";
  const known = new Set(request.tokens.map((token) => token.token));
  for (const match of text.matchAll(/⟦([^⟦⟧]*)⟧/g)) {
    const digits = match[1]!.trim();
    if (!/^\d+$/.test(digits) || !known.has(`⟦${Number(digits)}⟧`)) return `the answer holds ${match[0]}, which the token legend does not list`;
  }
  // Every bracket in the masked block belongs to a token, so a lone bracket is a broken token.
  if (/[⟦⟧]/.test(text.replace(/⟦[^⟦⟧]*⟧/g, ""))) return "the answer holds a broken token bracket";
  if (/^[[{]/.test(text) && !/^[[{]/.test(original)) return "the answer is shaped like JSON or an array";
  const lastLine = text.split(/\r?\n/).filter((line) => line.trim()).at(-1)!;
  if (endsSentence(original) && !endsSentence(lastLine)) return "the answer stops before its final punctuation";
  return undefined;
}

/** Terminal punctuation, then only closing quotes, brackets, or markdown marks. */
function endsSentence(text: string): boolean {
  return /[.!?:…]["'”’)\]*_~]*$/.test(text.trim());
}
