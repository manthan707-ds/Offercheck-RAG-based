import "dotenv/config";
import fs from "node:fs";
import { analyze } from "../src/analyze";

const data: { label: "scam" | "legit"; text: string }[] = JSON.parse(fs.readFileSync(new URL("./dataset.json", import.meta.url), "utf8"));
const rows: Record<string, unknown>[] = [];

for (const retrieval of [false, true]) {
  let tp = 0, fp = 0, fn = 0, tn = 0, grounded = 0;
  for (const d of data) {
    const v = await analyze(d.text, { retrieval });
    const pred = v.risk === "high" || v.risk === "medium";
    if (pred && d.label === "scam") tp++; else if (pred) fp++; else if (d.label === "scam") fn++; else tn++;
    grounded += v.grounded;
  }
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  rows.push({
    system: retrieval ? "RAG (hybrid + grounding guard)" : "LLM only",
    precision: +precision.toFixed(2), recall: +recall.toFixed(2),
    f1: +((2 * precision * recall) / (precision + recall || 1)).toFixed(2),
    faithfulness: retrieval ? +(grounded / data.length).toFixed(2) : "n/a",
  });
}
console.table(rows);
fs.writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(rows, null, 2));
