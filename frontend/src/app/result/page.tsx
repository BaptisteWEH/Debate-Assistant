"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface DebateResult {
    user_score:  number;
    ai_score:    number;
    summary:     string;
    level:       string;
    dimensions:  Record<string, number | null>;
    qualitative: Record<string, string>;
}

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
        icon: (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3-3h-15a3 3 0 0 1 3 3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
            </svg>
        ),
    },
    {
        key: "weakest_point",
        title: "Weakest point",
        icon: (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
        ),
    },
    {
        key: "missed_opportunity",
        title: "Missed opportunity",
        icon: (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
        ),
    },
    {
        key: "argument_pattern",
        title: "Recurring pattern",
        icon: (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
        ),
    },
    {
        key: "ai_assessment",
        title: "Overall assessment",
        icon: (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
        ),
    },
];

const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    easy:         { label: "Easy",         color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
    intermediate: { label: "Intermediate", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
    hard:         { label: "Hard",         color: "#DC2626", bg: "#FFF1F2", border: "#FECDD3" },
};

function ScoreRing({ score, size = 148, strokeWidth = 10, animate }: {
    score?: number; size?: number; strokeWidth?: number; animate: boolean;
}) {
    const cx = size / 2, cy = size / 2;
    const r = (size / 2) - strokeWidth - 2;
    const circumference = 2 * Math.PI * r;
    const filled = (animate && score != null) ? (score / 100) * circumference : 0;
    const gap = circumference - filled;
    const offset = circumference * 0.25;

    return (
        <svg width={size} height={size}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={strokeWidth} />
            <circle
                cx={cx} cy={cy} r={r} fill="none"
                stroke="var(--text)" strokeWidth={strokeWidth}
                strokeDasharray={`${filled} ${gap}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.25, 1, 0.5, 1)" }}
            />
            <text
                x={cx} y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                fontSize={32}
                fontWeight="800"
                fontFamily="var(--font-geist-sans), -apple-system, sans-serif"
            >
                {score != null ? score : "–"}
            </text>
        </svg>
    );
}

function SkeletonLine({ width = "100%" }: { width?: string }) {
    return <div style={{ width, height: 13, borderRadius: 6, background: "#F4F4F5", animation: "shimmer 1.8s ease-in-out infinite" }} />;
}

export default function ResultPage() {
    const [result, setResult]           = useState<DebateResult | null>(null);
    const [animated, setAnimated]       = useState(false);
    const [email, setEmail]             = useState("");
    const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const downloadBtnRef                = useRef<HTMLButtonElement>(null);

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
            const res = await fetch(`${API_BASE}/send-report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), result }),
            });
            const data = await res.json();
            setEmailStatus(data.success ? "sent" : "error");
        } catch { setEmailStatus("error"); }
    };

    const levelCfg = result ? (LEVEL_CONFIG[result.level] ?? { label: result.level }) : null;
    const scoredDimensions = DIMENSIONS.filter((d) => result?.dimensions?.[d.key] != null);

    const getGrade = (score: number): { label: string; color: string; bg: string; border: string } => {
        if (score >= 90) return { label: "Outstanding",  color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" };
        if (score >= 80) return { label: "Excellent",    color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" };
        if (score >= 70) return { label: "Good",         color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" };
        if (score >= 60) return { label: "Developing",   color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" };
        return                  { label: "Needs work",   color: "#DC2626", bg: "#FFF1F2", border: "#FECDD3" };
    };

    return (
        <>
            <style>{`@keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
            <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

                {/* Top bar */}
                <div className="no-print" style={{
                    background: "var(--nav)", backdropFilter: "blur(12px)",
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                    padding: "0 32px", height: 58,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    position: "sticky", top: 0, zIndex: 20,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}>
                    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", fontSize: 14, color: "var(--text-3)" }}
                        className="hover:text-zinc-900 transition-colors">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                        </svg>
                        Back to home
                    </Link>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Session Results</span>
                    <button
                        ref={downloadBtnRef}
                        onClick={handleDownload}
                        style={{
                            display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-3)",
                            background: "var(--card)", border: "1px solid var(--border)",
                            borderRadius: 9, padding: "7px 14px", cursor: "pointer",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                        }}
                        className="hover:border-zinc-300 transition-colors"
                    >
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download PDF
                    </button>
                </div>

                <div id="pdf-capture" style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px 80px" }}>

                    {/* Score hero */}
                    <div style={{
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 20, padding: "40px 36px", marginBottom: 16, textAlign: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    }}>
                        <ScoreRing score={result?.user_score} animate={animated} />

                        {result ? (
                            <>
                                <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                                    {(() => { const g = getGrade(result.user_score); return (
                                        <span style={{
                                            fontSize: 12, fontWeight: 600, color: g.color,
                                            background: g.bg, border: `1px solid ${g.border}`,
                                            borderRadius: 999, padding: "4px 14px",
                                        }}>
                                            {g.label}
                                        </span>
                                    ); })()}
                                    {levelCfg && (
                                        <span style={{
                                            fontSize: 12, fontWeight: 600, color: levelCfg.color,
                                            background: levelCfg.bg, border: `1px solid ${levelCfg.border}`,
                                            borderRadius: 999, padding: "4px 14px",
                                        }}>
                                            {levelCfg.label}
                                        </span>
                                    )}
                                </div>
                                <p style={{ marginTop: 20, fontSize: 15, color: "var(--text-2)", lineHeight: 1.75, maxWidth: 480, margin: "20px auto 0" }}>
                                    {result.summary}
                                </p>
                            </>
                        ) : (
                            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 120, height: 22, borderRadius: 999, background: "#F4F4F5", animation: "shimmer 1.8s ease-in-out infinite" }} />
                                <SkeletonLine width="60%" />
                                <SkeletonLine width="45%" />
                            </div>
                        )}
                    </div>

                    {/* Score breakdown */}
                    <div style={{
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 20, padding: "28px", marginBottom: 16,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 20 }}>
                            Score Breakdown
                        </p>

                        {(result ? scoredDimensions : DIMENSIONS).map((d, i, arr) => {
                            const score = result?.dimensions?.[d.key] ?? null;
                            return (
                                <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: i < arr.length - 1 ? 14 : 0 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)", flexShrink: 0 }} />
                                    <span style={{ fontSize: 14, color: "var(--text-2)", width: 170, flexShrink: 0 }}>{d.label}</span>
                                    <div style={{ flex: 1, height: 4, background: "var(--subtle)", borderRadius: 999, overflow: "hidden" }}>
                                        <div style={{
                                            width: animated && score != null ? `${score}%` : "0%",
                                            height: "100%", background: "var(--text)", borderRadius: 999,
                                            transition: `width 1s cubic-bezier(0.25, 1, 0.5, 1) ${i * 80}ms`,
                                        }} />
                                    </div>
                                    <span style={{ fontSize: 14, fontWeight: score != null ? 700 : 400, color: score != null ? "var(--text)" : "var(--text-4)", width: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                        {score != null ? score : "–"}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Qualitative analysis */}
                    <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 14 }}>
                            Qualitative Analysis
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {QUAL_CARDS.map((card, i) => {
                                const body = result?.qualitative?.[card.key];
                                const isFullWidth = i === QUAL_CARDS.length - 1 && QUAL_CARDS.length % 2 !== 0;
                                return (
                                    <div key={card.key} style={{
                                        background: "var(--card)", border: "1px solid var(--border)",
                                        borderRadius: 16, padding: "20px",
                                        gridColumn: isFullWidth ? "1 / -1" : undefined,
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: 8,
                                                background: "var(--subtle)", color: "var(--text-3)",
                                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                            }}>
                                                {card.icon}
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{card.title}</span>
                                        </div>
                                        {body ? (
                                            <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65 }}>{body}</p>
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

                    {/* Email report */}
                    <div className="no-print" style={{
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 20, padding: "28px", marginBottom: 16,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 12 }}>
                            Email Report
                        </p>
                        <p style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.6 }}>
                            Receive this report as a summary in your inbox.
                        </p>
                        <div style={{ display: "flex", gap: 10 }}>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSendEmail(); }}
                                placeholder="your@email.com"
                                style={{
                                    flex: 1, border: "1px solid var(--border)", borderRadius: 10,
                                    padding: "10px 14px", fontSize: 14, outline: "none",
                                    fontFamily: "inherit", transition: "border-color 0.15s",
                                    background: "var(--bg)", color: "var(--text)",
                                }}
                                className="focus:border-zinc-400"
                            />
                            <button
                                onClick={handleSendEmail}
                                disabled={emailStatus === "sending" || !email.trim()}
                                style={{
                                    background: email.trim() && emailStatus !== "sending" ? "var(--btn)" : "var(--subtle)",
                                    color: email.trim() && emailStatus !== "sending" ? "var(--btn-fg)" : "var(--text-4)",
                                    border: "none", borderRadius: 10, padding: "10px 20px",
                                    fontSize: 14, fontWeight: 600,
                                    cursor: email.trim() && emailStatus !== "sending" ? "pointer" : "not-allowed",
                                    fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s",
                                    boxShadow: email.trim() && emailStatus !== "sending" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                                }}
                            >
                                {emailStatus === "sending" ? "Sending…" : "Send report"}
                            </button>
                        </div>
                        {emailStatus === "sent" && (
                            <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                Sent. Check your inbox.
                            </p>
                        )}
                        {emailStatus === "error" && (
                            <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-3)" }}>Something went wrong. Try again.</p>
                        )}
                    </div>

                    {/* What's next */}
                    <div className="no-print" style={{
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 20, padding: "28px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 18 }}>
                            What&apos;s Next
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <Link href="/upload" style={{
                                display: "flex", flexDirection: "column", gap: 4, padding: "18px",
                                border: "1px solid var(--border)", borderRadius: 14, textDecoration: "none",
                                background: "var(--subtle)",
                            }}
                                className="hover:border-zinc-300 transition-all">
                                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>New document</span>
                                <span style={{ fontSize: 13, color: "var(--text-4)" }}>Upload different source material</span>
                            </Link>
                            <Link href="/upload" style={{
                                display: "flex", flexDirection: "column", gap: 4, padding: "18px",
                                border: "1px solid var(--text)", borderRadius: 14, textDecoration: "none",
                                background: "var(--btn)",
                            }}
                                className="hover:opacity-85 transition-opacity">
                                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--btn-fg)" }}>Debate again</span>
                                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Same or harder difficulty</span>
                            </Link>
                        </div>
                    </div>

                </div>
            </main>
        </>
    );
}
