"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
    role: "ai" | "user";
    text: string;
    timestamp?: string;
}

interface EvidenceItem {
    id: string;
    source?: string;
    page?: number;
    pages?: string;
    text: string;
    score?: number;
}

interface FallacyInfo {
    has_fallacy: boolean;
    fallacy_type: string;
    explanation: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const LEVEL_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    easy:         { label: "Easy",         color: "#059669", bg: "#ECFDF5" },
    intermediate: { label: "Intermediate", color: "#2563EB", bg: "#EFF6FF" },
    hard:         { label: "Hard",         color: "#DC2626", bg: "#FEF2F2" },
};

function formatTime(d: Date) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

type MicState = "idle" | "recording" | "processing";

// ─── Main component ───────────────────────────────────────────────────────────

function DebatePageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const sessionIdFromUrl = searchParams.get("session_id");
    const openingFromUrl   = searchParams.get("opening");
    const levelFromUrl     = searchParams.get("level") ?? "easy";
    const filenameFromUrl  = searchParams.get("filename") ?? "Document";

    const [messages, setMessages] = useState<Message[]>([
        {
            role: "ai",
            text: openingFromUrl || "I've read your document and I'm ready to defend my position. Make your opening argument.",
            timestamp: formatTime(new Date()),
        },
    ]);
    const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
    const [fallacy, setFallacy]   = useState<FallacyInfo | null>(null);
    const [input, setInput]       = useState("");
    const [loading, setLoading]   = useState(false);
    const [micState, setMicState] = useState<MicState>("idle");
    const [sessionId]             = useState(() => sessionIdFromUrl ?? crypto.randomUUID());
    const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
    const [elapsed, setElapsed]   = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef   = useRef<Blob[]>([]);
    const transcriptEndRef = useRef<HTMLDivElement | null>(null);
    const audioRef         = useRef<HTMLAudioElement | null>(null);
    const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);

    const levelInfo = LEVEL_LABELS[levelFromUrl] ?? LEVEL_LABELS.easy;

    // Session timer
    useEffect(() => {
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // Auto-scroll
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    // ── Send text turn ────────────────────────────────────────────────────────

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;
        setInput("");
        setFallacy(null);

        const userMsg: Message = { role: "user", text, timestamp: formatTime(new Date()) };
        const next = [...messages, userMsg];
        setMessages(next);
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/debate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, session_id: sessionId }),
            });
            const data = await res.json();

            setMessages([...next, { role: "ai", text: data.response, timestamp: formatTime(new Date()) }]);
            setEvidence(data.evidence ?? []);
            setFallacy(data.fallacy?.has_fallacy ? data.fallacy : null);

            if (data.audio_url) {
                audioRef.current = new Audio(data.audio_url);
                audioRef.current.play();
            }

            if (data.agent_decision === "end_debate" && data.session_feedback) {
                const fb = data.session_feedback;
                sessionStorage.setItem("debateResult", JSON.stringify({
                    user_score:  fb.score?.user ?? 0,
                    ai_score:    fb.score?.ai ?? 0,
                    summary:     fb.summary ?? "",
                    level:       levelFromUrl,
                    dimensions:  fb.dimensions ?? {},
                    qualitative: fb.qualitative ?? {},
                }));
                router.push("/result");
                return;
            }
        } catch (err) {
            console.error(err);
            setMessages([...next, { role: "ai", text: "Connection error. Please check the backend is running.", timestamp: formatTime(new Date()) }]);
        }
        setLoading(false);
    };

    // ── Mic ───────────────────────────────────────────────────────────────────

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.onstop = handleRecordingStop;
            mr.start();
            setMicState("recording");
        } catch {
            alert("Microphone access denied.");
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
        setMicState("processing");
    };

    const handleRecordingStop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "recording.webm");
        form.append("session_id", sessionId);
        try {
            const res  = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: form });
            const data = await res.json();
            if (data.transcript?.trim()) await sendMessage(data.transcript);
        } catch (err) { console.error(err); }
        setMicState("idle");
    };

    const toggleMic = () => {
        if (micState === "idle")      startRecording();
        else if (micState === "recording") stopRecording();
    };

    // ── End session ───────────────────────────────────────────────────────────

    const endSession = async () => {
        setLoading(true);
        try {
            const res  = await fetch(`${API_BASE}/end-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId }),
            });
            const data = await res.json();
            sessionStorage.setItem("debateResult", JSON.stringify({
                user_score:  data.score.user,
                ai_score:    data.score.ai,
                summary:     data.summary,
                level:       levelFromUrl,
                dimensions:  data.dimensions ?? {},
                qualitative: data.qualitative ?? {},
            }));
            router.push("/result");
        } catch {
            alert("Could not end session. Please try again.");
            setLoading(false);
        }
    };

    const turns = Math.floor((messages.length - 1) / 2);

    return (
        <main style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#F9FAFB", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif", overflow: "hidden" }}>

            {/* ── Header ───────────────────────────────────────────────────── */}
            <header style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                {/* Left: branding + session info */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, background: "#0A0A0A", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                            </svg>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", letterSpacing: "-0.01em" }}>DebateCoach</span>
                    </div>
                    <div style={{ width: 1, height: 18, background: "#E5E7EB" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: levelInfo.color, background: levelInfo.bg, padding: "3px 10px", borderRadius: 999 }}>
                        {levelInfo.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#9CA3AF", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {filenameFromUrl}
                    </span>
                </div>

                {/* Center: stats */}
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", lineHeight: 1 }}>{turns}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>ROUNDS</p>
                    </div>
                    <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatDuration(elapsed)}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>ELAPSED</p>
                    </div>
                </div>

                {/* Right: end session */}
                <button
                    onClick={endSession}
                    disabled={loading}
                    style={{
                        background: "#0A0A0A", color: "white", border: "none",
                        borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 600,
                        cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
                        display: "flex", alignItems: "center", gap: 7,
                    }}
                    className="hover:opacity-85 transition-opacity"
                >
                    <svg width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 15Z" />
                    </svg>
                    End & Score
                </button>
            </header>

            {/* ── Body ─────────────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", gap: 0, overflow: "hidden" }}>

                {/* ── Evidence panel ────────────────────────────────────────── */}
                <aside style={{ background: "white", borderRight: "1px solid #E5E7EB", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ padding: "16px 18px", borderBottom: "1px solid #F3F4F6" }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 2 }}>
                            Document Evidence
                        </p>
                        <p style={{ fontSize: 12, color: "#D1D5DB" }}>
                            Passages used in the last AI response
                        </p>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
                        {evidence.length === 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#D1D5DB", textAlign: "center", padding: "24px 16px" }}>
                                <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                                <p style={{ fontSize: 13 }}>Cited passages will appear here after the AI responds.</p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {evidence.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveEvidenceId(activeEvidenceId === item.id ? null : item.id)}
                                        style={{
                                            width: "100%", textAlign: "left",
                                            background: activeEvidenceId === item.id ? "#F9FAFB" : "white",
                                            border: `1px solid ${activeEvidenceId === item.id ? "#D1D5DB" : "#F3F4F6"}`,
                                            borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                                            transition: "all 0.12s",
                                        }}
                                        className="hover:border-gray-300"
                                    >
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 6 }}>
                                            <span style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                                {item.source ?? "Document"}{item.pages ? ` · p. ${item.pages}` : item.page ? ` · p. ${item.page}` : ""}
                                            </span>
                                            {item.score !== undefined && (
                                                <span style={{ fontSize: 10, fontWeight: 600, background: "#0A0A0A", color: "white", borderRadius: 999, padding: "2px 7px", flexShrink: 0 }}>
                                                    {Math.round(item.score * 100)}%
                                                </span>
                                            )}
                                        </div>
                                        <p style={{
                                            fontSize: 12, color: "#374151", lineHeight: 1.6,
                                            display: "-webkit-box", WebkitBoxOrient: "vertical" as const,
                                            WebkitLineClamp: activeEvidenceId === item.id ? undefined : 3,
                                            overflow: "hidden",
                                        }}>
                                            {item.text}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                {/* ── Debate panel ──────────────────────────────────────────── */}
                <section style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

                    {/* Fallacy alert */}
                    {fallacy && (
                        <div style={{ margin: "12px 16px 0", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <svg style={{ flexShrink: 0, marginTop: 1 }} width="16" height="16" fill="none" stroke="#D97706" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                                    {fallacy.fallacy_type.replace(/_/g, " ")}
                                </p>
                                <p style={{ fontSize: 13, color: "#78350F" }}>{fallacy.explanation}</p>
                            </div>
                            <button onClick={() => setFallacy(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#D97706", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
                        </div>
                    )}

                    {/* Transcript */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720, margin: "0 auto" }}>
                            {messages.map((msg, i) => (
                                <div key={i} style={{ display: "flex", gap: 12, flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                                    {/* Avatar */}
                                    <div style={{
                                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                                        background: msg.role === "ai" ? "#0A0A0A" : "#E5E7EB",
                                        color: msg.role === "ai" ? "white" : "#374151",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 11, fontWeight: 700, marginTop: 4,
                                    }}>
                                        {msg.role === "ai" ? "AI" : "U"}
                                    </div>

                                    {/* Bubble */}
                                    <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 4, alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                                        <div style={{
                                            background: msg.role === "ai" ? "white" : "#0A0A0A",
                                            color: msg.role === "ai" ? "#1F2937" : "white",
                                            border: msg.role === "ai" ? "1px solid #E5E7EB" : "none",
                                            borderRadius: msg.role === "ai" ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                                            padding: "12px 16px", fontSize: 14, lineHeight: 1.65,
                                        }}>
                                            {msg.text}
                                        </div>
                                        {msg.timestamp && (
                                            <span style={{ fontSize: 10, color: "#D1D5DB", padding: "0 4px" }}>{msg.timestamp}</span>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Typing indicator */}
                            {loading && (
                                <div style={{ display: "flex", gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0, marginTop: 4 }}>
                                        AI
                                    </div>
                                    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: "4px 16px 16px 16px", padding: "14px 18px" }}>
                                        <ThinkingDots />
                                    </div>
                                </div>
                            )}

                            <div ref={transcriptEndRef} />
                        </div>
                    </div>

                    {/* ── Input bar ─────────────────────────────────────────── */}
                    <div style={{ borderTop: "1px solid #E5E7EB", padding: "14px 20px", background: "white" }}>
                        {micState !== "idle" && (
                            <p style={{ fontSize: 12, textAlign: "center", color: "#9CA3AF", marginBottom: 10 }}
                                className={micState === "recording" ? "animate-pulse" : ""}>
                                {micState === "recording" ? "Recording, click mic to stop" : "Transcribing…"}
                            </p>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 720, margin: "0 auto" }}>
                            {/* Mic */}
                            <button
                                onClick={toggleMic}
                                disabled={micState === "processing" || loading}
                                style={{
                                    width: 42, height: 42, borderRadius: 12, border: "none", cursor: "pointer",
                                    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                    background: micState === "recording" ? "#FEF2F2" : "#F3F4F6",
                                    color: micState === "recording" ? "#EF4444" : "#6B7280",
                                    transition: "all 0.15s",
                                }}
                                className={micState === "recording" ? "animate-pulse" : "hover:bg-gray-200"}
                                title={micState === "idle" ? "Start recording" : "Stop recording"}
                            >
                                {micState === "processing" ? (
                                    <svg className="animate-spin" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                    </svg>
                                )}
                            </button>

                            {/* Text input */}
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                                placeholder={
                                    micState === "recording" ? "Recording…" :
                                    micState === "processing" ? "Transcribing…" :
                                    "Make your argument…"
                                }
                                disabled={micState !== "idle" || loading}
                                style={{
                                    flex: 1, background: "#F9FAFB", border: "1px solid #E5E7EB",
                                    borderRadius: 12, padding: "11px 16px", fontSize: 14,
                                    outline: "none", fontFamily: "inherit",
                                    transition: "border-color 0.15s",
                                }}
                                className="focus:border-gray-400 disabled:opacity-50"
                            />

                            {/* Send */}
                            <button
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || loading || micState !== "idle"}
                                style={{
                                    width: 42, height: 42, borderRadius: 12, border: "none",
                                    background: input.trim() && !loading ? "#0A0A0A" : "#E5E7EB",
                                    cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0, transition: "all 0.15s",
                                }}
                                className={input.trim() && !loading ? "hover:opacity-80" : ""}
                            >
                                <svg width="16" height="16" fill="none" stroke={input.trim() && !loading ? "white" : "#9CA3AF"} strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}

// ─── Thinking dots ────────────────────────────────────────────────────────────

function ThinkingDots() {
    return (
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {[0, 1, 2].map((i) => (
                <span key={i} className="animate-bounce" style={{
                    width: 7, height: 7, borderRadius: "50%", background: "#D1D5DB",
                    animationDelay: `${i * 0.15}s`, display: "inline-block",
                }} />
            ))}
        </div>
    );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function DebatePage() {
    return (
        <Suspense fallback={
            <main style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "#9CA3AF", fontSize: 14 }}>Loading debate session…</p>
            </main>
        }>
            <DebatePageInner />
        </Suspense>
    );
}
