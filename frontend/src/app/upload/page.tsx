"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Level = "easy" | "intermediate" | "hard";

const LEVELS: {
    id: Level;
    label: string;
    tag: string;
    persona: string;
    bullets: string[];
    dimensions: string;
    accent: string;
    bg: string;
    glow: string;
}[] = [
    {
        id: "easy",
        label: "Easy",
        tag: "Supportive",
        persona: "Supportive Guide",
        bullets: [
            "Asks one guiding question per round",
            "No counter-arguments, only scaffolding",
            "Helps you articulate your position clearly",
        ],
        dimensions: "Claim Clarity · Evidence · Logic",
        accent: "#16A34A",
        bg: "#F0FDF4",
        glow: "rgba(22,163,74,0.1)",
    },
    {
        id: "intermediate",
        label: "Intermediate",
        tag: "Challenging",
        persona: "Analytical Challenger",
        bullets: [
            "Introduces direct counter-arguments every turn",
            "Expects you to rebut specific opposing claims",
            "Tracks consistency across the full debate",
        ],
        dimensions: "+ Rebuttal · Consistency",
        accent: "#2563EB",
        bg: "#EFF6FF",
        glow: "rgba(37,99,235,0.1)",
    },
    {
        id: "hard",
        label: "Hard",
        tag: "Adversarial",
        persona: "Rigorous Adversary",
        bullets: [
            "Uses the document as a weapon against you",
            "Exploits vague language and logical gaps",
            "No concessions. Demands rhetorical precision.",
        ],
        dimensions: "+ Rhetorical Depth",
        accent: "#DC2626",
        bg: "#FFF1F2",
        glow: "rgba(220,38,38,0.1)",
    },
];

const LOADING_STEPS = [
    "Extracting text from document...",
    "Building semantic knowledge index...",
    "Generating AI opening statement...",
];

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [level, setLevel] = useState<Level>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("dc-default-level") as Level | null;
            if (saved && ["easy", "intermediate", "hard"].includes(saved)) return saved;
        }
        return "easy";
    });
    const [isUploading, setIsUploading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [errorMsg, setErrorMsg] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const router = useRouter();
    const { data: session } = useSession();

    useEffect(() => {
        if (isUploading) {
            setLoadingStep(0);
            stepTimerRef.current = setInterval(() => {
                setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
            }, 3500);
        } else {
            if (stepTimerRef.current) clearInterval(stepTimerRef.current);
        }
        return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); };
    }, [isUploading]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setErrorMsg(""); }
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) { setFile(f); setErrorMsg(""); }
    };

    const handleStartDebate = async () => {
        if (!file) { setErrorMsg("Please upload a document before continuing."); return; }
        setIsUploading(true);
        setErrorMsg("");

        const sessionId = crypto.randomUUID();
        const form = new FormData();
        form.append("file1", file);
        form.append("session_id", sessionId);
        form.append("level", level);
        const userId = (session?.user as { id?: string } | undefined)?.id;
        if (userId) form.append("user_id", userId);

        try {
            const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail ?? `Server error ${res.status}`);
            }
            const data = await res.json();
            const params = new URLSearchParams({
                session_id: data.session_id ?? sessionId,
                opening: data.opening_statement ?? "",
                level,
                filename: file.name,
            });
            router.push(`/debate?${params.toString()}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
            setErrorMsg(msg);
            setIsUploading(false);
        }
    };

    const selectedLevel = LEVELS.find((l) => l.id === level)!;

    if (isUploading) {
        return (
            <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ textAlign: "center", maxWidth: 380, padding: "0 24px" }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: "50%",
                        background: "linear-gradient(135deg, #334155 0%, #0F172A 100%)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 32px",
                    }}>
                        <svg style={{ animation: "spin 0.8s linear infinite" }} width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 10, letterSpacing: "-0.02em" }}>Preparing your session</h2>
                    <p style={{ fontSize: 15, color: "var(--text-3)", marginBottom: 48 }}>{LOADING_STEPS[loadingStep]}</p>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        {LOADING_STEPS.map((_, i) => (
                            <div key={i} style={{
                                height: 3, borderRadius: 999,
                                width: i === loadingStep ? 28 : 8,
                                background: i <= loadingStep ? "var(--btn)" : "var(--border)",
                                transition: "all 0.4s ease",
                            }} />
                        ))}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-4)", marginTop: 28 }}>This may take 20-60 seconds</p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

            {/* Nav */}
            <div style={{
                background: "var(--nav)", backdropFilter: "blur(12px)",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
                padding: "0 32px", height: 60,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                position: "sticky", top: 0, zIndex: 20,
            }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                    <svg width="16" height="16" fill="none" stroke="#A1A1AA" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                    </svg>
                    <span style={{ fontSize: 14, color: "var(--text-3)" }}>Home</span>
                </Link>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>New Session</span>
                <div style={{ width: 80 }} />
            </div>

            <div style={{ maxWidth: 680, margin: "0 auto", padding: "52px 24px 80px" }}>

                {/* Choose difficulty */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Choose difficulty</h2>
                    <Link href="/rubric" style={{
                        fontSize: 13, color: "var(--text-3)", textDecoration: "none",
                        display: "flex", alignItems: "center", gap: 4,
                    }}
                        className="hover:text-zinc-900 transition-colors">
                        See details
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </Link>
                </div>

                {/* Level pill toggle */}
                <div style={{ display: "flex", gap: 2, background: "var(--border)", borderRadius: 10, padding: 4, marginBottom: 16 }}>
                    {LEVELS.map((l) => {
                        const selected = level === l.id;
                        return (
                            <button
                                key={l.id}
                                onClick={() => setLevel(l.id)}
                                style={{
                                    flex: 1, padding: "9px 0", borderRadius: 7, cursor: "pointer",
                                    border: selected ? "1px solid #BFDBFE" : "1px solid transparent",
                                    fontSize: 14, fontWeight: selected ? 600 : 500,
                                    background: selected ? "#D0E7FF" : "transparent",
                                    color: selected ? "#1E3A5F" : "#71717A",
                                    boxShadow: selected ? "0 1px 3px rgba(37,99,235,0.15)" : "none",
                                    transition: "all 0.15s", outline: "none",
                                }}
                            >
                                {l.label}
                            </button>
                        );
                    })}
                </div>

                {/* Level detail panel */}
                <div style={{
                    background: "#EFF6FF", border: "1px solid #BFDBFE",
                    borderLeft: "3px solid #2563EB",
                    borderRadius: 14, padding: "22px 24px", marginBottom: 40,
                    boxShadow: "0 1px 4px rgba(37,99,235,0.08)",
                    transition: "all 0.2s",
                }}>
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#08090A", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {selectedLevel.persona}
                        </p>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 9 }}>
                        {selectedLevel.bullets.map((b) => (
                            <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--text-2)" }}>
                                <svg style={{ flexShrink: 0, marginTop: 2 }} width="14" height="14" fill="none" stroke="#08090A" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                {b}
                            </li>
                        ))}
                    </ul>
                    <p style={{ fontSize: 12, color: "var(--text-4)", borderTop: "1px solid #F4F4F5", paddingTop: 12 }}>
                        Scored on: <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{selectedLevel.dimensions}</span>
                    </p>
                </div>

                {/* Upload document */}
                <div style={{ marginBottom: 14 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Upload document</h2>
                </div>

                {!file ? (
                    <label
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        style={{
                            display: "block", cursor: "pointer",
                            border: `1.5px dashed ${isDragging ? "#2563EB" : "var(--border)"}`,
                            background: isDragging ? "#EFF6FF" : "white",
                            borderRadius: 16, padding: "52px 24px", textAlign: "center",
                            transition: "all 0.15s", marginBottom: 32,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        }}
                    >
                        <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: "var(--subtle)", border: "1px solid var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
                        }}>
                            <svg width="20" height="20" fill="none" stroke="var(--text-3)" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>
                            Click to upload or drag &amp; drop
                        </p>
                        <p style={{ fontSize: 13, color: "var(--text-4)" }}>PDF only, up to 50 MB</p>
                    </label>
                ) : (
                    <div style={{
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 14, padding: "18px 20px",
                        display: "flex", alignItems: "center", gap: 16, marginBottom: 32,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    }}>
                        <div style={{ width: 42, height: 42, background: "#F4F4F5", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="18" height="18" fill="none" stroke="#52525B" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {file.name}
                            </p>
                            <p style={{ fontSize: 12, color: "var(--text-4)", marginTop: 2 }}>
                                {(file.size / 1024).toFixed(0)} KB &middot; PDF
                            </p>
                        </div>
                        <button onClick={() => setFile(null)} style={{ background: "#F4F4F5", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            className="hover:bg-zinc-200 transition-colors">
                            <svg width="13" height="13" fill="none" stroke="#71717A" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {errorMsg && (
                    <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                        <svg width="15" height="15" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        <p style={{ fontSize: 14, color: "#DC2626" }}>{errorMsg}</p>
                    </div>
                )}

                <button
                    onClick={handleStartDebate}
                    disabled={!file}
                    style={{
                        width: "100%",
                        background: file ? selectedLevel.accent : "var(--border)",
                        color: file ? "white" : "#A1A1AA",
                        border: "none",
                        borderRadius: 12, padding: "15px 24px",
                        fontSize: 15, fontWeight: 700, cursor: file ? "pointer" : "not-allowed",
                        transition: "all 0.15s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        letterSpacing: "-0.01em",
                        boxShadow: file ? "0 1px 3px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)" : "none",
                    }}
                    className={file ? "hover:opacity-85 transition-opacity" : ""}
                >
                    Start debate
                    {file && (
                        <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                    )}
                </button>
            </div>
        </main>
    );
}
