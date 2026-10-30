export interface Passage { id: string; source: string; title: string; text: string; tags: string[]; url?: string; key?: string }
export type Risk = "high" | "medium" | "low" | "unclear";
export interface Signal { label: string; severity: "high" | "medium" | "low"; explanation: string; evidence: string[]; quotes: string[] }
export interface Verdict { risk: Risk; score: number; summary: string; signals: Signal[]; sources: Passage[]; grounded: number; mode: "rag" | "demo" }
