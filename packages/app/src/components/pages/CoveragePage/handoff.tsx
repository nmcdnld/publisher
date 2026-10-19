// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { renderToStaticMarkup } from "react-dom/server";
import type { Ontology } from "../../../ontology/types";
import { Markdown } from "../../chat/Markdown";
import {
   type Classification,
   type CoverageRun,
   type Investigation,
   JUDGE_LABEL,
   type Question,
   STATUS_META,
} from "./model";

const INVESTIGATION_LABEL: Record<Investigation["via"], string> = {
   chat: "Re-run as chat",
   rescore: "Agent re-score",
   asked: "Asked in the Ask window",
};

/** The body of the last `## title` / `### title` section, if any. */
function section(markdown: string, title: string): string | undefined {
   const heading = new RegExp(`^#{2,4}\\s*${title}\\s*:?\\s*$`, "gim");
   const matches = [...markdown.matchAll(heading)];
   const last = matches.at(-1);
   if (!last || last.index === undefined) return undefined;
   const rest = markdown.slice(last.index + last[0].length);
   const end = rest.search(/^#{1,4}\s/m);
   const body = (end < 0 ? rest : rest.slice(0, end)).trim();
   return body || undefined;
}

/** The ✅/❌ bullets of the investigation's last verdict, one per concept. */
function verdictChecks(transcript: string): string[] | undefined {
   const start = transcript.lastIndexOf("### Verdict");
   if (start < 0) return undefined;
   const bullets = transcript
      .slice(start)
      .split("\n")
      .filter((line) => /^\s*[-*]/.test(line) && /[✅❌]/u.test(line))
      .map((line) => line.replace(/^\s*[-*]\s*/, "").trim());
   return bullets.length ? bullets : undefined;
}

/** Text safe inside one Markdown table cell. */
function cell(text: string) {
   return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function when(at: number) {
   return new Date(at).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
   });
}

/**
 * Everything a coding agent needs to close one coverage gap: the question,
 * the verdict and its evidence, the recommended model changes, checkable exit
 * criteria, and the investigation that produced them.
 */
export function handoffMarkdown({
   ontology,
   run,
   question,
   result,
   investigation,
}: {
   ontology: Ontology;
   run: CoverageRun;
   question: Question;
   result?: Classification;
   investigation?: Investigation;
}): string {
   const pkg = `${ontology.environmentName}/${ontology.packageName}`;
   const status = result?.status ?? investigation?.verdict;
   const verdictBy = result?.chat
      ? `chat re-run${result.chat.model ? `, ${result.chat.model}` : ""}, ${when(result.chat.at)}`
      : result
        ? `${JUDGE_LABEL[result.judge]}${result.judge === "agent" ? "" : `, ${Math.round(result.confidence * 100)}% confident`}`
        : "not judged yet";
   const transcript = investigation?.transcript;
   const recommended = transcript && section(transcript, "Recommended changes");
   const criteria = transcript && section(transcript, "Exit criteria");
   const concepts =
      result?.concepts ?? question.concepts.map((c) => ({ ...c, present: -1 }));
   const checks = transcript ? verdictChecks(transcript) : undefined;
   const models = [
      ...new Set((result?.retrieved ?? []).map((r) => `\`${r.model}\``)),
   ];

   const lines: Array<string | false | undefined> = [
      `# Coverage gap: ${question.text}`,
      "",
      `> Hand-off from Malloy Publisher's Question Coverage. Change the Malloy model in package \`${ontology.packageName}\` (environment \`${ontology.environmentName}\`) so this question becomes answerable, then check every exit criterion below. Use Publisher's MCP tools (\`get_context\`, \`compile_model\`, \`reload_package\`, \`execute_query\`) with these exact names.`,
      "",
      "| | |",
      "|---|---|",
      `| Package | \`${pkg}\` |`,
      `| Asked by | ${[question.persona, question.category].filter(Boolean).join(" · ")} |`,
      `| Verdict | **${status ? STATUS_META[status].label : "Unknown"}** (${verdictBy}) |`,
      investigation?.verdict &&
         !result?.chat &&
         investigation.verdict !== result?.status &&
         `| Chat verdict | **${STATUS_META[investigation.verdict].label}** (not saved to the heat map) |`,
      result?.chat?.batch &&
         `| Batch verdict | ${STATUS_META[result.chat.batch].label} |`,
      investigation &&
         `| Investigation | ${INVESTIGATION_LABEL[investigation.via]}${investigation.model ? `, ${investigation.model}` : ""}, ${when(investigation.at)} |`,
      models.length > 0 && `| Model files retrieved | ${models.join(", ")} |`,
      `| Coverage run | \`${run.id}\`, question \`${question.id}\` |`,
      "",
      "## What the question needs",
      "",
      checks
         ? "| Concept | Type | Batch retrieval | Chat investigation |"
         : "| Concept | Type | In the model |",
      checks ? "|---|---|---|---|" : "|---|---|---|",
      ...concepts.map((c, i) => {
         const batch =
            c.present < 0
               ? "not judged"
               : c.present >= 0.5
                 ? "✅ present"
                 : "❌ absent";
         const row = `| ${c.text} | ${c.type.replace("_", " ")} | ${batch} |`;
         if (!checks) return row;
         const named = checks.find((b) =>
            b.toLowerCase().includes(c.text.toLowerCase()),
         );
         const check = checks.length === concepts.length ? checks[i] : named;
         return `${row} ${check ? cell(check) : "not mentioned"} |`;
      }),
      "",
      "## Recommended changes",
      "",
      recommended ??
         (transcript
            ? "The investigation did not list changes in its own section; read it below."
            : "No investigation yet. Re-run this question as a chat in Question Coverage for recommendations."),
      "",
      "## Exit criteria",
      "",
      ...(criteria ? [criteria, ""] : []),
      `- [ ] \`compile_model\` at \`package\` scope reports no errors for \`${pkg}\`.`,
      "- [ ] `reload_package` succeeds and `get_status` lists no `loadErrors` entry (stale or otherwise) for the package.",
      `- [ ] Re-running this question in Question Coverage ("Re-run as chat") closes with **Verdict: answerable**.`,
      "",
   ];
   if (result && result.retrieved.length > 0) {
      lines.push(
         "## What batch retrieval found",
         "",
         ...result.retrieved.map(
            (r) =>
               `- \`${r.source}\` in \`${r.model}\`: ${r.fields.map((f) => `\`${f}\``).join(", ")}`,
         ),
         "",
      );
   }
   if (transcript) {
      lines.push("## Investigation", "", transcript, "");
   }
   return lines.filter((line) => typeof line === "string").join("\n");
}

export function handoffFilename(ontology: Ontology, question: Question) {
   const slug = question.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
   return `coverage-${ontology.packageName}-${slug}`;
}

export function downloadMarkdown(filename: string, markdown: string) {
   const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
   );
   const link = document.createElement("a");
   link.href = url;
   link.download = `${filename}.md`;
   link.click();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PRINT_CSS = `
body { font: 12px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; max-width: 760px; margin: 24px auto; }
h1 { font-size: 20px; margin: 0 0 12px; } h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; } h3 { font-size: 13px; margin: 16px 0 6px; }
blockquote { margin: 0 0 12px; padding: 6px 12px; border-left: 3px solid #ccc; color: #444; }
table { border-collapse: collapse; margin: 8px 0; } th, td { border: 1px solid #ddd; padding: 3px 8px; text-align: left; vertical-align: top; }
code { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; background: #f3f3f3; padding: 0 3px; border-radius: 3px; }
pre { background: #f5f5f5; padding: 8px 10px; border-radius: 4px; white-space: pre-wrap; break-inside: avoid; } pre code { background: none; padding: 0; }
ul, ol { padding-left: 20px; } li { margin: 2px 0; }
@page { margin: 16mm; }
`;

/** Open the browser's print dialog on the document, to save it as a PDF. */
export function printPdf(title: string, markdown: string) {
   const body = renderToStaticMarkup(<Markdown text={markdown} />);
   const frame = document.createElement("iframe");
   frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
   document.body.appendChild(frame);
   const doc = frame.contentDocument;
   const view = frame.contentWindow;
   if (!doc || !view) {
      frame.remove();
      return;
   }
   const safeTitle = title.replace(/[<&>]/g, "");
   doc.open();
   doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`,
   );
   doc.close();
   view.addEventListener("afterprint", () => frame.remove());
   view.focus();
   view.print();
}
