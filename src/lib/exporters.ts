import { jsPDF } from "jspdf";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { AnalysisRecordDTO } from "@/types/convobrief";

function slugifyFileName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "convobrief-summary"
  );
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatSummaryAsPlainText(record: AnalysisRecordDTO): string {
  const r = record.structuredResult;
  const lines: string[] = [];

  lines.push("======================================================================");
  lines.push(`CONVOBRIEF AI — CONVERSATION INTELLIGENCE BRIEF`);
  lines.push("======================================================================");
  lines.push(`Title:            ${r.conversation_title}`);
  lines.push(`Summary Mode:     ${record.mode.toUpperCase()} (${record.lengthPreference})`);
  lines.push(`Overall Priority: ${record.overallImportance}`);
  lines.push(`Language:         ${record.detectedLanguage}`);
  lines.push(`Participants:     ${record.participants.join(", ")} (${record.participantCount})`);
  lines.push(`Messages:         ${record.messageCount} (${record.noiseFilteredPercent}% noise/duplicates removed)`);
  lines.push(`Generated At:     ${new Date(record.updatedAt).toLocaleString()}`);
  lines.push("");

  lines.push("1. OVERVIEW & MAIN TOPIC");
  lines.push("----------------------------------------------------------------------");
  lines.push(`Main Topic: ${r.main_topic}`);
  lines.push(`Purpose:    ${r.purpose}`);
  lines.push("");
  lines.push(r.overview);
  if (r.mode_bullets && r.mode_bullets.length > 0) {
    lines.push("");
    for (const b of r.mode_bullets) {
      lines.push(`  • ${b}`);
    }
  }
  lines.push("");

  lines.push("2. KEY DISCUSSION POINTS");
  lines.push("----------------------------------------------------------------------");
  if (r.key_points.length === 0) {
    lines.push("  No distinct key points extracted.");
  } else {
    r.key_points.forEach((kp, idx) => {
      lines.push(
        `  ${idx + 1}. [${kp.importance} | ${kp.statement_type.toUpperCase()}] ${kp.point} (Msg #${kp.source_message_ids.join(", #")})`
      );
    });
  }
  lines.push("");

  lines.push("3. IMPORTANT DECISIONS");
  lines.push("----------------------------------------------------------------------");
  if (r.important_decisions.length === 0) {
    lines.push("  No formal decisions were explicitly stated in the conversation.");
  } else {
    r.important_decisions.forEach((d, idx) => {
      lines.push(
        `  ${idx + 1}. [${d.importance}] ${d.decision} (Msg #${d.source_message_ids.join(", #")})`
      );
      if (d.superseded_context) {
        lines.push(`     Note: ${d.superseded_context}`);
      }
    });
  }
  lines.push("");

  lines.push("4. ACTION ITEMS & RESPONSIBILITIES");
  lines.push("----------------------------------------------------------------------");
  if (r.action_items.length === 0) {
    lines.push("  No explicit action items identified.");
  } else {
    r.action_items.forEach((a, idx) => {
      lines.push(`  ${idx + 1}. [${a.importance}] ${a.task}`);
      lines.push(
        `     Assigned To: ${a.assigned_to || "Not specified"} | Deadline: ${a.deadline || "Not specified"} | Status: ${a.status} (Msg #${a.source_message_ids.join(", #")})`
      );
    });
  }
  lines.push("");

  lines.push("5. DEADLINES & IMPORTANT DATES");
  lines.push("----------------------------------------------------------------------");
  if (r.deadlines.length === 0) {
    lines.push("  Not specified.");
  } else {
    r.deadlines.forEach((dl) => {
      lines.push(
        `  • ${dl.date_expression} — ${dl.milestone} (Owner: ${dl.owner || "Not specified"})`
      );
    });
  }
  lines.push("");

  lines.push("6. PROBLEMS, PROPOSED SOLUTIONS & RISKS");
  lines.push("----------------------------------------------------------------------");
  if (r.problems.length === 0 && r.risks.length === 0) {
    lines.push("  No critical problems or risks flagged.");
  } else {
    r.problems.forEach((p) => {
      lines.push(`  • Problem [${p.resolution_status}]: ${p.problem}`);
    });
    r.proposed_solutions.forEach((s) => {
      lines.push(`  • Proposed Solution [${s.outcome}]: ${s.solution}`);
    });
    r.risks.forEach((rk) => {
      lines.push(`  • Risk [${rk.importance}]: ${rk.risk}`);
    });
  }
  lines.push("");

  lines.push("7. UNRESOLVED QUESTIONS");
  lines.push("----------------------------------------------------------------------");
  if (r.unresolved_questions.length === 0) {
    lines.push("  None.");
  } else {
    r.unresolved_questions.forEach((q) => {
      lines.push(
        `  • ${q.question} (Asked by: ${q.asked_by || "Not specified"}, Msg #${q.source_message_ids.join(", #")})`
      );
    });
  }
  lines.push("");

  lines.push("8. IMPORTANT ENTITIES & TECHNICAL TERMS");
  lines.push("----------------------------------------------------------------------");
  if (r.important_entities.length === 0) {
    lines.push("  None extracted.");
  } else {
    lines.push(
      "  " +
        r.important_entities
          .map((e) => `${e.name} (${e.type}, ${e.mentions}x)`)
          .join(", ")
    );
  }
  lines.push("");

  lines.push("9. CONCLUSION & HISTORICAL CONTEXT");
  lines.push("----------------------------------------------------------------------");
  lines.push(`Historical Context: ${r.historical_context}`);
  lines.push(`Conclusion:         ${r.conclusion}`);

  return lines.join("\n");
}

export function exportAsTxt(record: AnalysisRecordDTO) {
  const content = formatSummaryAsPlainText(record);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  triggerBlobDownload(
    blob,
    `${slugifyFileName(record.structuredResult.conversation_title)}.txt`
  );
}

export function exportAsJson(record: AnalysisRecordDTO) {
  const content = JSON.stringify(record.structuredResult, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  triggerBlobDownload(
    blob,
    `${slugifyFileName(record.structuredResult.conversation_title)}.json`
  );
}

export function exportAsPdf(record: AnalysisRecordDTO) {
  const r = record.structuredResult;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (needed = 28) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 48;
    }
  };

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y - 16, maxWidth, 64, 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("ConvoBrief AI — Conversation Intelligence Report", margin + 16, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Mode: ${record.mode.toUpperCase()}  |  Importance: ${record.overallImportance}  |  Language: ${record.detectedLanguage}  |  Messages: ${record.messageCount}`,
    margin + 16,
    y + 28
  );
  y += 68;

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  const titleLines = doc.splitTextToSize(r.conversation_title, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 19 + 8;

  const writeSectionHeading = (heading: string) => {
    ensureSpace(36);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229);
    doc.text(heading.toUpperCase(), margin, y);
    y += 16;
  };

  const writeBodyParagraph = (text: string, boldPrefix?: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    const full = boldPrefix ? `${boldPrefix} ${text}` : text;
    const lines = doc.splitTextToSize(full, maxWidth);
    for (const line of lines) {
      ensureSpace(15);
      doc.text(line, margin, y);
      y += 13.5;
    }
    y += 4;
  };

  writeSectionHeading("1. Overview & Purpose");
  writeBodyParagraph(r.main_topic, "Main Topic:");
  writeBodyParagraph(r.overview);

  writeSectionHeading(`2. Key Points (${r.key_points.length})`);
  if (r.key_points.length === 0) {
    writeBodyParagraph("No distinct key points extracted.");
  } else {
    r.key_points.forEach((kp, idx) => {
      writeBodyParagraph(
        `${idx + 1}. [${kp.importance} • ${kp.statement_type}] ${kp.point} (Msg #${kp.source_message_ids.join(", #")})`
      );
    });
  }

  writeSectionHeading(`3. Decisions (${r.important_decisions.length})`);
  if (r.important_decisions.length === 0) {
    writeBodyParagraph("No formal binding decisions were explicitly declared.");
  } else {
    r.important_decisions.forEach((d, idx) => {
      writeBodyParagraph(
        `${idx + 1}. [${d.importance}] ${d.decision} (Msg #${d.source_message_ids.join(", #")})`
      );
    });
  }

  writeSectionHeading(`4. Action Items (${r.action_items.length})`);
  if (r.action_items.length === 0) {
    writeBodyParagraph("No explicit action items identified.");
  } else {
    r.action_items.forEach((a, idx) => {
      writeBodyParagraph(
        `${idx + 1}. [${a.importance}] ${a.task} — Assigned To: ${a.assigned_to || "Not specified"} | Deadline: ${a.deadline || "Not specified"} (Msg #${a.source_message_ids.join(", #")})`
      );
    });
  }

  writeSectionHeading("5. Deadlines, Risks & Unresolved Questions");
  if (r.deadlines.length > 0) {
    r.deadlines.forEach((dl) => {
      writeBodyParagraph(
        `• Deadline (${dl.date_expression}): ${dl.milestone} — Owner: ${dl.owner || "Not specified"}`
      );
    });
  } else {
    writeBodyParagraph("• Deadlines: Not specified");
  }
  r.unresolved_questions.forEach((q) => {
    writeBodyParagraph(
      `• Unresolved Question: ${q.question} (Asked by: ${q.asked_by || "Not specified"})`
    );
  });
  r.risks.forEach((rk) => {
    writeBodyParagraph(`• Risk [${rk.importance}]: ${rk.risk}`);
  });

  writeSectionHeading("6. Conclusion");
  writeBodyParagraph(r.conclusion);

  doc.save(`${slugifyFileName(r.conversation_title)}.pdf`);
}

export async function exportAsDocx(record: AnalysisRecordDTO) {
  const r = record.structuredResult;
  const children: Paragraph[] = [
    new Paragraph({
      text: r.conversation_title,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `ConvoBrief AI Report  •  Mode: ${record.mode.toUpperCase()}  •  Importance: ${record.overallImportance}  •  Language: ${record.detectedLanguage}  •  Participants: ${record.participants.join(", ")}`,
          italics: true,
          color: "475569",
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Overview & Main Topic",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Main Topic: ", bold: true }),
        new TextRun({ text: r.main_topic }),
      ],
    }),
    new Paragraph({ text: r.overview }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Key Discussion Points",
      heading: HeadingLevel.HEADING_2,
    }),
    ...(r.key_points.length > 0
      ? r.key_points.map(
          (kp) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun({
                  text: `[${kp.importance} | ${kp.statement_type.toUpperCase()}] `,
                  bold: true,
                }),
                new TextRun({
                  text: `${kp.point} (Msg #${kp.source_message_ids.join(", #")})`,
                }),
              ],
            })
        )
      : [new Paragraph({ text: "No distinct key points extracted." })]),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Important Decisions",
      heading: HeadingLevel.HEADING_2,
    }),
    ...(r.important_decisions.length > 0
      ? r.important_decisions.map(
          (d) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun({ text: `[${d.importance}] `, bold: true }),
                new TextRun({
                  text: `${d.decision} (Msg #${d.source_message_ids.join(", #")})`,
                }),
              ],
            })
        )
      : [new Paragraph({ text: "No formal decisions explicitly stated." })]),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Action Items & Responsibilities",
      heading: HeadingLevel.HEADING_2,
    }),
    ...(r.action_items.length > 0
      ? r.action_items.map(
          (a) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun({ text: `[${a.importance}] `, bold: true }),
                new TextRun({ text: `${a.task} — ` }),
                new TextRun({
                  text: `Assigned To: ${a.assigned_to || "Not specified"} | Deadline: ${a.deadline || "Not specified"}`,
                  italics: true,
                }),
              ],
            })
        )
      : [new Paragraph({ text: "No explicit action items identified." })]),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Unresolved Questions & Risks",
      heading: HeadingLevel.HEADING_2,
    }),
    ...(r.unresolved_questions.length > 0
      ? r.unresolved_questions.map(
          (q) =>
            new Paragraph({
              bullet: { level: 0 },
              text: `Question: ${q.question} (Asked by: ${q.asked_by || "Not specified"})`,
            })
        )
      : [new Paragraph({ text: "No unanswered questions." })]),
    ...r.risks.map(
      (rk) =>
        new Paragraph({
          bullet: { level: 0 },
          text: `Risk [${rk.importance}]: ${rk.risk}`,
        })
    ),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Conclusion",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({ text: r.conclusion }),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(
    blob,
    `${slugifyFileName(r.conversation_title)}.docx`
  );
}
