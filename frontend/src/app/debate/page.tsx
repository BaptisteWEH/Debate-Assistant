"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

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

const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    easy:         { label: "Easy",         color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
    intermediate: { label: "Intermediate", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
    hard:         { label: "Hard",         color: "#DC2626", bg: "#FFF1F2", border: "#FECDD3" },
};

function formatTime(d: Date) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function SparkBars({ stats }: { stats: number[] }) {
    const SLOTS = 8;
    const H = 52;
    const maxVal = Math.max(...stats, 1);
    return (
        <svg viewBox={`0 0 220 ${H}`} width="100%" height={H}
            preserveAspectRatio="none" style={{ display: "block" }}>
            {Array.from({ length: SLOTS }).map((_, i) => {
                const hasData = i < stats.length;
                const h = hasData ? Math.max(5, Math.round((stats[i] / maxVal) * (H - 4))) : 5;
                const isLatest = hasData && i === stats.length - 1;
                return (
                    <rect key={i}
                        x={i * 28} y={H - h}
                        width={20} height={h} rx={3}
                        fill={isLatest ? "#08090A" : hasData ? "#D4D4D8" : "#EBEBEB"}
                    />
                );
            })}
        </svg>
    );
}

type MicState = "idle" | "recording" | "processing";

function DebatePageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { data: session } = useSession();

    const sessionIdFromUrl = searchParams.get("session_id");
    const openingFromUrl   = searchParams.get("opening");
    const levelFromUrl     = searchParams.get("level") ?? "easy";
    const filenameFromUrl  = searchParams.get("filename") ?? "Document";

    const [messages, setMessages] = useState<Message[]>([
        {
            role: "ai",
            text: openingFromUrl || "I've read your document and I'm ready to defend my position. Make your opening argument.",
        },
    ]);
    const [evidence, setEvidence]         = useState<EvidenceItem[]>([]);
    const [fallacy, setFallacy]           = useState<FallacyInfo | null>(null);
    const [input, setInput]               = useState("");
    const [loading, setLoading]           = useState(false);
    const [micState, setMicState]         = useState<MicState>("idle");
    const [sessionId]                     = useState(() => sessionIdFromUrl ?? (typeof window !== "undefined" ? crypto.randomUUID() : ""));
    const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
    const [elapsed, setElapsed]           = useState(0);
    const [roundStats, setRoundStats]     = useState<number[]>([]);
    const [fallacyCount, setFallacyCount] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef   = useRef<Blob[]>([]);
    const transcriptEndRef = useRef<HTMLDivElement | null>(null);
    const textareaRef      = useRef<HTMLTextAreaElement | null>(null);
    const audioRef         = useRef<HTMLAudioElement | null>(null);
    const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);

    const levelCfg = LEVEL_CONFIG[levelFromUrl] ?? LEVEL_CONFIG.easy;

    useEffect(() => {
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;
        setInput("");
        setFallacy(null);

        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
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
            if (!res.ok) throw new Error(data.detail ?? `Server error ${res.status}`);

            setMessages([...next, { role: "ai", text: data.response, timestamp: formatTime(new Date()) }]);
            setEvidence(data.evidence ?? []);

            const hasFallacy = data.fallacy?.has_fallacy;
            setFallacy(hasFallacy ? data.fallacy : null);
            if (hasFallacy) setFallacyCount((c) => c + 1);
            setRoundStats((prev) => [...prev, wordCount]);

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
        if (micState === "idle")           startRecording();
        else if (micState === "recording") stopRecording();
    };

    const endSession = async () => {
        setLoading(true);
        try {
            const res  = await fetch(`${API_BASE}/end-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail ?? `Server error ${res.status}`);
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
        <>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes bounce-dot { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
                .dot-anim { animation: bounce-dot 1.2s ease-in-out infinite; }
                input::placeholder { color: #A1A1AA; }
                .sidebar-sec { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-4); margin-bottom: 10px; }
            `}</style>

            <main style={{
                height: "100vh", display: "flex", flexDirection: "column",
                background: "var(--bg)", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif",
                overflow: "hidden",
            }}>

                {/* Header */}
                <header style={{
                    background: "var(--nav)", backdropFilter: "blur(12px)",
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                    padding: "0 32px", height: 72,
                    display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
                    position: "relative",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                                <ellipse cx="21.8432" cy="40" rx="21.8432" ry="40" transform="matrix(-0.659044 0.752104 0.752104 0.659044 49.791 18.9385)" fill="currentColor"/>
                                <ellipse cx="65.4794" cy="61.7286" rx="21.8432" ry="40" transform="rotate(48.773 65.4794 61.7286)" fill="currentColor"/>
                            </svg>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>DebateCoach</span>
                        <span style={{ fontSize: 12, color: "var(--text-4)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: 6 }}>
                            {filenameFromUrl}
                        </span>
                    </div>

                    {/* Truly centered stats */}
                    <div style={{
                        position: "absolute", left: "50%", top: "50%",
                        transform: "translate(-50%, calc(-50% + 4px))",
                        display: "flex", alignItems: "center", gap: 32,
                    }}>
                        <div style={{ textAlign: "center" }}>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{levelCfg.label}</p>
                            <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 3, letterSpacing: "0.07em" }}>LEVEL</p>
                        </div>
                        <div style={{ textAlign: "center" }}>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{turns}</p>
                            <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 3, letterSpacing: "0.07em" }}>ROUNDS</p>
                        </div>
                        <div style={{ textAlign: "center" }}>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatDuration(elapsed)}</p>
                            <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 3, letterSpacing: "0.07em" }}>ELAPSED</p>
                        </div>
                    </div>

                    <button
                        onClick={endSession}
                        disabled={loading}
                        style={{
                            background: "var(--btn)", color: "var(--btn-fg)", border: "none",
                            borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 600,
                            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
                            display: "flex", alignItems: "center", gap: 6,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                        }}
                    >
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 15Z" />
                        </svg>
                        End &amp; Score
                    </button>
                </header>

                {/* Body */}
                <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

                    {/* Left sidebar — always visible */}
                    <aside style={{
                        width: 256, flexShrink: 0,
                        background: "var(--card)", borderRight: "1px solid var(--border)",
                        display: "flex", flexDirection: "column", overflow: "hidden",
                    }}>

                        {/* Live performance */}
                        <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                            <p className="sidebar-sec">Live Performance</p>
                            <SparkBars stats={roundStats} />
                            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <div style={{ flex: 1, background: "var(--subtle)", borderRadius: 10, padding: "9px 10px" }}>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{turns}</p>
                                    <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 3 }}>Rounds</p>
                                </div>
                                <div style={{ flex: 1, borderRadius: 10, padding: "9px 10px", background: "var(--subtle)" }}>
                                    <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: "var(--text)" }}>{fallacyCount}</p>
                                    <p style={{ fontSize: 10, marginTop: 3, color: "var(--text-4)" }}>Fallacies</p>
                                </div>
                            </div>
                            {roundStats.length > 1 && (
                                <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8 }}>
                                    Avg {Math.round(roundStats.reduce((a, b) => a + b, 0) / roundStats.length)} words/round
                                </p>
                            )}
                        </div>

                        {/* Evidence */}
                        <div style={{ padding: "14px 16px 8px", flexShrink: 0 }}>
                            <p className="sidebar-sec">
                                Evidence{evidence.length > 0 ? ` (${evidence.length})` : ""}
                            </p>
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
                            {evidence.length === 0 ? (
                                <p style={{ fontSize: 12, color: "var(--text-4)", lineHeight: 1.6, paddingTop: 4 }}>
                                    Passages cited by the AI will appear here after each response.
                                </p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                    {evidence.map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => setActiveEvidenceId(activeEvidenceId === item.id ? null : item.id)}
                                            style={{
                                                borderLeft: `2px solid ${activeEvidenceId === item.id ? "var(--text)" : "var(--border)"}`,
                                                paddingLeft: 12, cursor: "pointer",
                                                transition: "border-color 0.15s",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5, gap: 6 }}>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {item.source ?? "Document"}{item.pages ? ` · p.${item.pages}` : item.page ? ` · p.${item.page}` : ""}
                                                </span>
                                                {item.score !== undefined && (
                                                    <span style={{ fontSize: 10, color: "var(--text-4)", flexShrink: 0 }}>
                                                        {Math.round(item.score * 100)}%
                                                    </span>
                                                )}
                                            </div>
                                            <p style={{
                                                fontSize: 12, color: "var(--text-2)", lineHeight: 1.65,
                                                display: "-webkit-box", WebkitBoxOrient: "vertical" as const,
                                                WebkitLineClamp: activeEvidenceId === item.id ? undefined : 4,
                                                overflow: "hidden",
                                            }}>
                                                {item.text}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* History + Account footer */}
                        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "12px 14px" }}>
                            {session ? (
                                <>
                                    <Link href="/history" style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                        textDecoration: "none", padding: "8px 0",
                                        borderBottom: "1px solid var(--border)", marginBottom: 10,
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                            <svg width="14" height="14" fill="none" stroke="var(--text-3)" strokeWidth="2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                            </svg>
                                            <span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500 }}>Session history</span>
                                        </div>
                                        <svg width="12" height="12" fill="none" stroke="var(--text-4)" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                        </svg>
                                    </Link>
                                    <Link href="/settings" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                                        {session.user?.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={session.user.image} alt="avatar" width={28} height={28} style={{ borderRadius: "50%", border: "1px solid var(--border)" }} />
                                        ) : (
                                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--subtle)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>
                                                    {session.user?.name?.[0]?.toUpperCase() ?? "U"}
                                                </span>
                                            </div>
                                        )}
                                        <div style={{ flex: 1, overflow: "hidden" }}>
                                            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {session.user?.name ?? "User"}
                                            </p>
                                            <p style={{ fontSize: 11, color: "var(--text-4)" }}>Settings →</p>
                                        </div>
                                    </Link>
                                </>
                            ) : (
                                <Link href="/login" style={{
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    textDecoration: "none", background: "var(--btn)", color: "var(--btn-fg)",
                                    padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: 600,
                                }}>
                                    Sign in to save history
                                </Link>
                            )}
                        </div>
                    </aside>

                    {/* Chat panel */}
                    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

                        {/* Fallacy alert */}
                        {fallacy && (
                            <div style={{
                                margin: "12px 20px 0",
                                background: "var(--card)", border: "1px solid var(--border)",
                                borderRadius: 12, padding: "11px 14px",
                                display: "flex", alignItems: "flex-start", gap: 10,
                                flexShrink: 0, maxWidth: 760, alignSelf: "center", width: "calc(100% - 40px)",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
                                        Fallacy · {fallacy.fallacy_type.replace(/_/g, " ")}
                                    </p>
                                    <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>{fallacy.explanation}</p>
                                </div>
                                <button onClick={() => setFallacy(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", fontSize: 16, lineHeight: 1, padding: "1px 0 0", flexShrink: 0 }}>
                                    ×
                                </button>
                            </div>
                        )}

                        {/* Transcript */}
                        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "32px 0" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>
                                {messages.map((msg, i) => (
                                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                                        {msg.role === "ai" ? (
                                            <p style={{
                                                fontSize: 15, lineHeight: 1.75, color: "var(--text)",
                                                wordBreak: "break-word", overflowWrap: "break-word",
                                            }}>
                                                {msg.text}
                                            </p>
                                        ) : (
                                            <div style={{
                                                background: "var(--subtle)",
                                                borderRadius: 18,
                                                padding: "12px 18px",
                                                fontSize: 15, lineHeight: 1.7, color: "var(--text)",
                                                maxWidth: "80%",
                                                wordBreak: "break-word", overflowWrap: "break-word",
                                            }}>
                                                {msg.text}
                                            </div>
                                        )}
                                        {msg.timestamp && (
                                            <span style={{ fontSize: 10, color: "#D4D4D8", marginTop: 4, padding: "0 2px" }}>{msg.timestamp}</span>
                                        )}
                                    </div>
                                ))}

                                {loading && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        {[0, 1, 2].map((i) => (
                                            <span key={i} className="dot-anim" style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4D4D8", display: "inline-block", animationDelay: `${i * 0.15}s` }} />
                                        ))}
                                    </div>
                                )}

                                <div ref={transcriptEndRef} />
                            </div>
                        </div>

                        {/* Input bar */}
                        <div style={{ padding: "12px 24px 20px", background: "var(--bg)", flexShrink: 0 }}>
                            <div style={{ maxWidth: 760, margin: "0 auto" }}>
                                <div style={{
                                    background: "var(--card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 20,
                                    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                                    overflow: "hidden",
                                }}>
                                    {micState !== "idle" && (
                                        <p style={{ fontSize: 12, textAlign: "center", color: micState === "recording" ? "#DC2626" : "#A1A1AA", padding: "10px 16px 0" }}>
                                            {micState === "recording" ? "Recording — click mic to stop" : "Transcribing..."}
                                        </p>
                                    )}
                                    <textarea
                                        ref={textareaRef}
                                        value={input}
                                        onChange={(e) => {
                                            setInput(e.target.value);
                                            e.target.style.height = "auto";
                                            e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                sendMessage(input);
                                                if (textareaRef.current) textareaRef.current.style.height = "auto";
                                            }
                                        }}
                                        placeholder={
                                            micState === "recording" ? "Recording..." :
                                            micState === "processing" ? "Transcribing..." :
                                            "Make your argument..."
                                        }
                                        disabled={micState !== "idle" || loading}
                                        rows={1}
                                        style={{
                                            width: "100%", background: "transparent",
                                            border: "none", outline: "none", resize: "none",
                                            padding: "16px 18px 8px", fontSize: 15,
                                            fontFamily: "inherit", color: "var(--text)",
                                            lineHeight: 1.6, display: "block", overflow: "hidden",
                                        }}
                                    />
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px 10px" }}>
                                        <button
                                            onClick={toggleMic}
                                            disabled={micState === "processing" || loading}
                                            style={{
                                                width: 34, height: 34, borderRadius: 9,
                                                border: `1px solid ${micState === "recording" ? "#FECDD3" : "var(--border)"}`,
                                                cursor: micState === "processing" || loading ? "not-allowed" : "pointer",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                background: micState === "recording" ? "#FFF1F2" : "transparent",
                                                color: micState === "recording" ? "#DC2626" : "#A1A1AA",
                                                transition: "all 0.15s",
                                            }}
                                            title={micState === "idle" ? "Start recording" : "Stop recording"}
                                        >
                                            {micState === "processing" ? (
                                                <svg style={{ animation: "spin 0.8s linear infinite" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                </svg>
                                            ) : (
                                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                                </svg>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                sendMessage(input);
                                                if (textareaRef.current) textareaRef.current.style.height = "auto";
                                            }}
                                            disabled={!input.trim() || loading || micState !== "idle"}
                                            style={{
                                                width: 34, height: 34, borderRadius: 9, border: "none",
                                                background: input.trim() && !loading ? "var(--btn)" : "var(--subtle)",
                                                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                flexShrink: 0, transition: "all 0.15s",
                                            }}
                                        >
                                            <svg width="14" height="14" fill="none" stroke={input.trim() && !loading ? "white" : "#A1A1AA"} strokeWidth="2.2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </>
    );
}

export default function DebatePage() {
    return (
        <Suspense fallback={
            <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--text)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </main>
        }>
            <DebatePageInner />
        </Suspense>
    );
}
