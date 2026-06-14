"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
}[] = [
    {
        id: "easy",
        label: "Easy",
        tag: "Supportive",
        persona: "Supportive Guide",
        bullets: [
            "Asks one guiding question per round",
            "No counter-arguments, only scaffolding",
            "Focused on helping you articulate your position",
        ],
        dimensions: "Claim Clarity · Evidence · Logic",
        accent: "#10B981",
        bg: "#ECFDF5",
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
        accent: "#3B82F6",
        bg: "#EFF6FF",
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
        accent: "#EF4444",
        bg: "#FEF2F2",
    },
];

const LOADING_STEPS = [
    "Extracting text from document…",
    "Building semantic knowledge index…",
    "Generating AI opening statement…",
];

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [level, setLevel] = useState<Level>("easy");
    const [isUploading, setIsUploading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [errorMsg, setErrorMsg] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const router = useRouter();

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
        form.append("file", file);
        form.append("session_id", sessionId);
        form.append("level", level);

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
            <main style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>
                <div style={{ textAlign: "center", maxWidth: 400 }}>
                    <div style={{ width: 56, height: 56, background: "#0A0A0A", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px" }}>
                        <svg className="animate-spin" width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0A0A0A", marginBottom: 10 }}>Preparing your session</h2>
                    <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 40 }}>{LOADING_STEPS[loadingStep]}</p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        {LOADING_STEPS.map((_, i) => (
                            <div key={i} style={{
                                width: i === loadingStep ? 24 : 8, height: 8,
                                borderRadius: 999,
                                background: i <= loadingStep ? "#0A0A0A" : "#E5E7EB",
                                transition: "all 0.4s ease",
                            }} />
                        ))}
                    </div>
                    <p style={{ fontSize: 12, color: "#D1D5DB", marginTop: 28 }}>This may take 20–60 seconds</p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

            {/* ── Top bar ───────────────────────────────────────────────────── */}
            <div style={{ background: "white", borderBottom: "1px solid #F3F4F6", padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                    <svg width="16" height="16" fill="none" stroke="#9CA3AF" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                    </svg>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>Home</span>
                </Link>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0A0A0A" }}>New Session</span>
                <Link href="/rubric" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}
                    className="hover:text-gray-600 transition-colors">
                    Scoring rubric
                </Link>
            </div>

            <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>

                {/* ── Section: Choose level ─────────────────────────────────── */}
                <div style={{ marginBottom: 40 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
                        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9CA3AF" }}>
                            1. Choose difficulty
                        </h2>
                        <Link href="/rubric" style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "none" }}
                            className="hover:text-gray-600 transition-colors">
                            Full rubric →
                        </Link>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        {LEVELS.map((l) => {
                            const selected = level === l.id;
                            return (
                                <button
                                    key={l.id}
                                    onClick={() => setLevel(l.id)}
                                    style={{
                                        background: selected ? "#0A0A0A" : "white",
                                        border: selected ? "2px solid #0A0A0A" : "2px solid #E5E7EB",
                                        borderRadius: 16,
                                        padding: "20px 18px",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        transition: "all 0.15s",
                                    }}
                                    className={!selected ? "hover:border-gray-400" : ""}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                        <span style={{
                                            fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                                            textTransform: "uppercase",
                                            color: selected ? "white" : l.accent,
                                            background: selected ? "rgba(255,255,255,0.15)" : l.bg,
                                            padding: "3px 8px", borderRadius: 999,
                                        }}>
                                            {l.tag}
                                        </span>
                                        {selected && (
                                            <div style={{ width: 18, height: 18, background: "white", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <svg width="10" height="10" fill="#0A0A0A" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <p style={{ fontSize: 16, fontWeight: 700, color: selected ? "white" : "#0A0A0A", marginBottom: 4 }}>
                                        {l.label}
                                    </p>
                                    <p style={{ fontSize: 12, color: selected ? "rgba(255,255,255,0.6)" : "#9CA3AF" }}>
                                        {l.persona}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    {/* Level detail */}
                    <div style={{ marginTop: 14, background: "white", border: "1px solid #E5E7EB", borderRadius: 14, padding: "18px 20px" }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: selectedLevel.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {selectedLevel.persona}
                        </p>
                        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                            {selectedLevel.bullets.map((b) => (
                                <li key={b} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 14, color: "#374151" }}>
                                    <svg style={{ flexShrink: 0, marginTop: 2 }} width="14" height="14" fill="none" stroke={selectedLevel.accent} strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                    </svg>
                                    {b}
                                </li>
                            ))}
                        </ul>
                        <p style={{ fontSize: 12, color: "#9CA3AF" }}>
                            Scored on: <span style={{ color: "#6B7280", fontWeight: 500 }}>{selectedLevel.dimensions}</span>
                        </p>
                    </div>
                </div>

                {/* ── Section: Upload document ──────────────────────────────── */}
                <div style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 16 }}>
                        2. Upload document
                    </h2>

                    {!file ? (
                        <label
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            style={{
                                display: "block", cursor: "pointer",
                                border: `2px dashed ${isDragging ? "#0A0A0A" : "#D1D5DB"}`,
                                background: isDragging ? "#F9FAFB" : "white",
                                borderRadius: 16, padding: "48px 24px", textAlign: "center",
                                transition: "all 0.15s",
                            }}
                            className={!isDragging ? "hover:border-gray-400" : ""}
                        >
                            <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx,.txt"
                                onChange={handleFileChange}
                            />
                            <div style={{ width: 44, height: 44, background: "#F3F4F6", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                                <svg width="20" height="20" fill="none" stroke="#9CA3AF" strokeWidth="1.8" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                                Click to upload or drag & drop
                            </p>
                            <p style={{ fontSize: 13, color: "#9CA3AF" }}>PDF, DOC, DOCX, TXT (up to 50 MB)</p>
                        </label>
                    ) : (
                        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{ width: 44, height: 44, background: "#F3F4F6", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="20" height="20" fill="none" stroke="#6B7280" strokeWidth="1.8" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 14, fontWeight: 600, color: "#0A0A0A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {file.name}
                                </p>
                                <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>
                                    {(file.size / 1024).toFixed(0)} KB · {file.name.split(".").pop()?.toUpperCase()}
                                </p>
                            </div>
                            <button
                                onClick={() => setFile(null)}
                                style={{ background: "#F3F4F6", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                className="hover:bg-gray-200 transition-colors"
                            >
                                <svg width="14" height="14" fill="none" stroke="#6B7280" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Error ─────────────────────────────────────────────────── */}
                {errorMsg && (
                    <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                        <svg width="16" height="16" fill="none" stroke="#EF4444" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        <p style={{ fontSize: 14, color: "#DC2626" }}>{errorMsg}</p>
                    </div>
                )}

                {/* ── Submit ────────────────────────────────────────────────── */}
                <button
                    onClick={handleStartDebate}
                    disabled={!file}
                    style={{
                        width: "100%", background: file ? "#0A0A0A" : "#E5E7EB",
                        color: file ? "white" : "#9CA3AF",
                        border: "none", borderRadius: 14, padding: "16px 24px",
                        fontSize: 15, fontWeight: 600, cursor: file ? "pointer" : "not-allowed",
                        transition: "all 0.15s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
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
