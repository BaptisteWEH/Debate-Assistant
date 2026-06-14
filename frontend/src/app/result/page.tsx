"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebateResult {
    user_score:  number;
    ai_score:    number;
    summary:     string;
    level:       string;
    dimensions:  Record<string, number | null>;
    qualitative: Record<string, string>;
}

// ─── Dimension config ─────────────────────────────────────────────────────────

const DIMENSIONS = [
    { key: "claim_clarity",        label: "Claim Clarity",        color: "#3B82F6" },
    { key: "evidence_integration", label: "Evidence Integration", color: "#10B981" },
    { key: "logical_structure",    label: "Logical Structure",    color: "#8B5CF6" },
    { key: "rebuttal_quality",     label: "Rebuttal Quality",     color: "#F59E0B" },
    { key: "consistency",          label: "Consistency",          color: "#EC4899" },
    { key: "rhetorical_depth",     label: "Rhetorical Depth",     color: "#EF4444" },
];

const QUAL_CARDS = [
    {
        key: "strongest_argument",
        title: "Strongest argument",
        accent: "#059669",
        bg: "#ECFDF5",
        icon: (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3-3h-15a3 3 0 0 1 3 3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
            </svg>
        ),
    },
    {
        key: "weakest_point",
        title: "Weakest point",
        accent: "#DC2626",
        bg: "#FEF2F2",
        icon: (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
        ),
    },
    {
        key: "missed_opportunity",
        title: "Missed opportunity",
        accent: "#D97706",
        bg: "#FFFBEB",
        icon: (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
        ),
    },
    {
        key: "argument_pattern",
        title: "Recurring pattern",
        accent: "#2563EB",
        bg: "#EFF6FF",
        icon: (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
        ),
    },
    {
        key: "ai_assessment",
        title: "Overall assessment",
        accent: "#475569",
        bg: "#F8FAFC",
        icon: (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
        ),
    },
];

const LEVEL_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    easy:         { label: "Easy",         color: "#059669", bg: "#ECFDF5" },
    intermediate: { label: "Intermediate", color: "#2563EB", bg: "#EFF6FF" },
    hard:         { label: "Hard",         color: "#DC2626", bg: "#FEF2F2" },
};

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 140, strokeWidth = 9, animate }: {
    score?: number; size?: number; strokeWidth?: number; animate: boolean;
}) {
    const cx = size / 2, cy = size / 2;
    const r = (size / 2) - strokeWidth;
    const circumference = 2 * Math.PI * r;
    const filled = (animate && score != null) ? (score / 100) * circumference : 0;

    return (
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={strokeWidth} />
            <circle
                cx={cx} cy={cy} r={r} fill="none"
                stroke={score != null ? "#0A0A0A" : "#F3F4F6"} strokeWidth={strokeWidth}
                strokeDasharray={`${filled} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.25, 1, 0.5, 1)" }}
            />
            <text x={cx} y={cy + 6}
                textAnchor="middle"
                fill={score != null ? "#0A0A0A" : "#D1D5DB"}
                fontSize={size === 140 ? 28 : 20}
                fontWeight="800"
                fontFamily="var(--font-geist-sans), -apple-system, sans-serif"
                style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px` }}
            >
                {score != null ? score : "-"}
            </text>
        </svg>
    );
}

// ─── Skeleton helpers ─────────────────────────────────────────────────────────

function SkeletonLine({ width = "100%" }: { width?: string }) {
    return <div className="skeleton" style={{ width, height: 14, borderRadius: 6, background: "#F3F4F6" }} />;
}

const shimmerCSS = `
@keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:.4} }
.skeleton { animation: shimmer 1.8s ease-in-out infinite; }
`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResultPage() {
    const [result, setResult]         = useState<DebateResult | null>(null);
    const [animated, setAnimated]     = useState(false);
    const [email, setEmail]           = useState("");
    const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const downloadBtnRef              = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const raw = sessionStorage.getItem("debateResult");
        if (raw) {
            try { setResult(JSON.parse(raw)); } catch { /* ignore */ }
        }
        const t = setTimeout(() => setAnimated(true), 120);
        return () => clearTimeout(t);
    }, []);

    const buildPdf = async () => {
        const el = document.getElementById("pdf-capture");
        if (!el) return null;
        const noPrint = document.querySelectorAll<HTMLElement>(".no-print");
        noPrint.forEach((n) => (n.style.visibility = "hidden"));
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import("html2canvas"),
            import("jspdf"),
        ]);
        const canvas  = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/png");
        const pdf     = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pw      = pdf.internal.pageSize.getWidth();
        pdf.addImage(imgData, "PNG", 0, 0, pw, (canvas.height * pw) / canvas.width);
        noPrint.forEach((n) => (n.style.visibility = ""));
        return pdf;
    };

    const handleDownload = async () => {
        const pdf = await buildPdf();
        pdf?.save("debate-report.pdf");
    };

    const handleSendEmail = async () => {
        if (!email.trim()) return;
        setEmailStatus("sending");
        try {
            const pdf = await buildPdf();
            if (!pdf) throw new Error();
            const res  = await fetch("http://localhost:3001/api/email-test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userEmail: email, pdfBase64: pdf.output("datauristring") }),
            });
            const data = await res.json();
            setEmailStatus(data.success ? "sent" : "error");
        } catch { setEmailStatus("error"); }
    };

    const levelInfo = result ? (LEVEL_LABELS[result.level] ?? { label: result.level, color: "#6B7280", bg: "#F9FAFB" }) : null;
    const scoredDimensions = DIMENSIONS.filter((d) => result?.dimensions?.[d.key] != null);

    const getGrade = (score: number) => {
        if (score >= 90) return { label: "Outstanding", color: "#059669" };
        if (score >= 80) return { label: "Excellent",   color: "#2563EB" };
        if (score >= 70) return { label: "Good",        color: "#7C3AED" };
        if (score >= 60) return { label: "Developing",  color: "#D97706" };
        return               { label: "Needs work",   color: "#DC2626" };
    };

    return (
        <>
            <style>{shimmerCSS}</style>
            <main style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

                {/* ── Top bar ──────────────────────────────────────────────── */}
                <div className="no-print" style={{
                    background: "white", borderBottom: "1px solid #E5E7EB",
                    padding: "0 32px", height: 60,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", fontSize: 14, color: "#6B7280" }}
                        className="hover:text-gray-900 transition-colors">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                        </svg>
                        Back to home
                    </Link>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#0A0A0A" }}>Session Results</span>
                    <button
                        ref={downloadBtnRef}
                        onClick={handleDownload}
                        style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#6B7280", background: "none", border: "1px solid #E5E7EB", borderRadius: 9, padding: "7px 14px", cursor: "pointer" }}
                        className="hover:border-gray-400 hover:text-gray-900 transition-all"
                    >
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download PDF
                    </button>
                </div>

                <div id="pdf-capture" style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px 80px" }}>

                    {/* ── Score hero ────────────────────────────────────────── */}
                    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 20, padding: "40px 36px", marginBottom: 20, textAlign: "center" }}>
                        <ScoreRing score={result?.user_score} animate={animated} />

                        {result ? (
                            <>
                                <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{
                                        fontSize: 13, fontWeight: 700, color: getGrade(result.user_score).color,
                                        background: "#F9FAFB", border: `1px solid ${getGrade(result.user_score).color}30`,
                                        borderRadius: 999, padding: "4px 14px",
                                    }}>
                                        {getGrade(result.user_score).label}
                                    </span>
                                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>·</span>
                                    <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 500 }}>
                                        AI scored {result.ai_score}/100
                                    </span>
                                    {levelInfo && (
                                        <>
                                            <span style={{ fontSize: 12, color: "#9CA3AF" }}>·</span>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: levelInfo.color, background: levelInfo.bg, padding: "3px 10px", borderRadius: 999 }}>
                                                {levelInfo.label}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <p style={{ marginTop: 20, fontSize: 15, color: "#374151", lineHeight: 1.7, maxWidth: 480, margin: "20px auto 0" }}>
                                    {result.summary}
                                </p>
                            </>
                        ) : (
                            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                                <div className="skeleton" style={{ width: 120, height: 22, borderRadius: 999, background: "#F3F4F6" }} />
                                <SkeletonLine width="60%" />
                                <SkeletonLine width="45%" />
                            </div>
                        )}
                    </div>

                    {/* ── Score breakdown ───────────────────────────────────── */}
                    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 20, padding: "28px 28px", marginBottom: 20 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 20 }}>
                            Score Breakdown
                        </p>

                        {(result ? scoredDimensions : DIMENSIONS).map((d, i) => {
                            const score = result?.dimensions?.[d.key] ?? null;
                            return (
                                <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: i < (result ? scoredDimensions : DIMENSIONS).length - 1 ? 14 : 0 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 14, color: "#374151", width: 170, flexShrink: 0 }}>{d.label}</span>
                                    <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 999, overflow: "hidden" }}>
                                        <div style={{
                                            width: animated && score != null ? `${score}%` : "0%",
                                            height: "100%", background: d.color, borderRadius: 999,
                                            transition: `width 1s cubic-bezier(0.25, 1, 0.5, 1) ${i * 80}ms`,
                                        }} />
                                    </div>
                                    <span style={{ fontSize: 14, fontWeight: score != null ? 700 : 400, color: score != null ? "#0A0A0A" : "#D1D5DB", width: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                        {score != null ? score : "-"}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Qualitative analysis ──────────────────────────────── */}
                    <div style={{ marginBottom: 20 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 14 }}>
                            Qualitative Analysis
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {QUAL_CARDS.map((card, i) => {
                                const body = result?.qualitative?.[card.key];
                                const isFullWidth = i === QUAL_CARDS.length - 1 && QUAL_CARDS.length % 2 !== 0;
                                return (
                                    <div key={card.key} style={{
                                        background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: "20px",
                                        gridColumn: isFullWidth ? "1 / -1" : undefined,
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                            <div style={{
                                                width: 30, height: 30, borderRadius: 8,
                                                background: card.bg, color: card.accent,
                                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                            }}>
                                                {card.icon}
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0A" }}>{card.title}</span>
                                        </div>
                                        {body ? (
                                            <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>{body}</p>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                                <SkeletonLine width="100%" />
                                                <SkeletonLine width="80%" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Send report ───────────────────────────────────────── */}
                    <div className="no-print" style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 20, padding: "28px", marginBottom: 20 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 16 }}>
                            Email Report
                        </p>
                        <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 16, lineHeight: 1.6 }}>
                            Receive this report as a PDF attachment.
                        </p>
                        <div style={{ display: "flex", gap: 10 }}>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSendEmail(); }}
                                placeholder="your@email.com"
                                style={{
                                    flex: 1, border: "1px solid #E5E7EB", borderRadius: 10,
                                    padding: "10px 14px", fontSize: 14, outline: "none",
                                    fontFamily: "inherit", transition: "border-color 0.15s",
                                }}
                                className="focus:border-gray-400"
                            />
                            <button
                                onClick={handleSendEmail}
                                disabled={emailStatus === "sending" || !email.trim()}
                                style={{
                                    background: email.trim() && emailStatus !== "sending" ? "#0A0A0A" : "#E5E7EB",
                                    color: email.trim() && emailStatus !== "sending" ? "white" : "#9CA3AF",
                                    border: "none", borderRadius: 10, padding: "10px 20px",
                                    fontSize: 14, fontWeight: 600, cursor: email.trim() && emailStatus !== "sending" ? "pointer" : "not-allowed",
                                    fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s",
                                }}
                            >
                                {emailStatus === "sending" ? "Sending…" : "Send PDF"}
                            </button>
                        </div>
                        {emailStatus === "sent" && (
                            <p style={{ marginTop: 10, fontSize: 13, color: "#059669", display: "flex", alignItems: "center", gap: 6 }}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                Sent. Check your inbox.
                            </p>
                        )}
                        {emailStatus === "error" && (
                            <p style={{ marginTop: 10, fontSize: 13, color: "#DC2626" }}>Something went wrong. Try again.</p>
                        )}
                    </div>

                    {/* ── What's next ───────────────────────────────────────── */}
                    <div className="no-print" style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 20, padding: "28px" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 20 }}>
                            What's Next
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <Link href="/upload" style={{
                                display: "flex", flexDirection: "column", gap: 4, padding: "18px",
                                border: "1px solid #E5E7EB", borderRadius: 14, textDecoration: "none",
                                transition: "all 0.15s",
                            }}
                                className="hover:border-gray-400 hover:shadow-sm">
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#0A0A0A" }}>Try a new document</span>
                                <span style={{ fontSize: 13, color: "#9CA3AF" }}>Upload different source material</span>
                            </Link>
                            <Link href={`/upload`} style={{
                                display: "flex", flexDirection: "column", gap: 4, padding: "18px",
                                border: "1px solid #0A0A0A", borderRadius: 14, textDecoration: "none",
                                background: "#0A0A0A", transition: "all 0.15s",
                            }}
                                className="hover:opacity-85">
                                <span style={{ fontSize: 14, fontWeight: 600, color: "white" }}>Debate again</span>
                                <span style={{ fontSize: 13, color: "#9CA3AF" }}>Same or harder difficulty</span>
                            </Link>
                        </div>
                    </div>

                </div>
            </main>
        </>
    );
}
