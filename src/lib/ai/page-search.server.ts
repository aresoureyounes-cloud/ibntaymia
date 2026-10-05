import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

export type PageCandidate = { url: string; path: string; title: string; excerpt: string };
export type PageMatch = { url: string; reason: string };

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export async function rankSavedPages(
  apiKey: string,
  query: string,
  pages: PageCandidate[],
): Promise<PageMatch[]> {
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const list = pages
    .map((p, i) => `#${i}\nPATH: ${p.path}\nTITLE: ${p.title}\nTEXT: ${p.excerpt}`)
    .join("\n\n");

  const result = streamText({
    model: provider.responses(MODEL),
    system:
      "You help staff of a school management platform find pages saved on their device. " +
      "Given a request and a numbered list of saved pages, pick up to 5 pages that best contain the requested information, most relevant first. " +
      "Only pick pages that are actually relevant; return an empty list if none are. " +
      'Reply with JSON only: {"matches":[{"index":number,"reason":string}]}. ' +
      "Write each reason as one short sentence (max 20 words) in the same language as the request.",
    prompt: `REQUEST:\n${query}\n\nSAVED PAGES:\n${list}`,
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

  const text = await result.text;
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: { matches?: { index?: unknown; reason?: unknown }[] } = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const out: PageMatch[] = [];
  for (const m of parsed.matches ?? []) {
    const i = Number(m.index);
    const page = Number.isInteger(i) ? pages[i] : undefined;
    if (page && !out.some((o) => o.url === page.url)) {
      out.push({ url: page.url, reason: String(m.reason ?? "").slice(0, 200) });
    }
    if (out.length >= 5) break;
  }
  return out;
}
