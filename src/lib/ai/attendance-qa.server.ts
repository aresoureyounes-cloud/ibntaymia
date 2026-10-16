import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

export type AttendanceRow = {
  date: string;
  period: string | null;
  subject: string | null;
  status: string;
  note: string | null;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export async function answerAttendanceQuestion(
  apiKey: string,
  question: string,
  studentName: string,
  range: { from: string; to: string },
  rows: AttendanceRow[],
): Promise<string> {
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const list = rows
    .map(
      (r) =>
        `${r.date} | ${r.period ?? "-"} | ${r.subject ?? "-"} | ${r.status}${r.note ? ` | ${r.note}` : ""}`,
    )
    .join("\n");

  const result = streamText({
    model: provider.responses(MODEL),
    system:
      "You answer questions from parents and students about a school attendance record. " +
      "Answer in the same language as the question (Arabic by default). " +
      "Base your answer ONLY on the records provided; never invent data. " +
      "If the records do not contain the answer, say so plainly. " +
      "Be concise: 1-4 short sentences, or a short list when summarizing. " +
      "Statuses: present=حاضر, absent=غائب, late=متأخر, excused=غياب مبرر.",
    prompt:
      `STUDENT: ${studentName}\nPERIOD: ${range.from} -> ${range.to}\n` +
      `RECORDS (date | period | subject | status | note):\n${list || "(empty)"}\n\nQUESTION:\n${question}`,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const text = (await result.text).trim();
  return text || "لم أتمكن من توليد إجابة، أعد المحاولة.";
}
