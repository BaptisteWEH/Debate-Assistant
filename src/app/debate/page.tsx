"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
    role: "ai" | "user";
    text: string;
    timestamp?: string;
}

interface EvidenceItem {
    id: string;
    page: number;
    text: string;
    score?: number; // cosine similarity 0-1 from FAISS, optional
}

// ─── API contract ─────────────────────────────────────────────────────────────
//
//  POST /debate
//  Body:  { message: string, session_id: string }
//  Response:
//    {
//      response: string,          // AI debate turn text
//      audio_url: string,         // S3 pre-signed URL for Polly MP3
//      evidence: EvidenceItem[],  // top-k FAISS chunks (id, page, text, score)
//      session_id: string         // echo back so frontend can persist it
//    }
//
//  POST /transcribe
//  Body:  FormData { audio: Blob (webm/ogg), session_id: string }
//  Response:
//    {
//      transcript: string         // AWS Transcribe result
//    }
//
//  POST /end-session
//  Body:  { session_id: string }
//  Response:
//    {
//      score: { user: number, ai: number },   // 0-100
//      summary: string,
//      transcript_url: string                 // S3 JSON file URL
//    }
//
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatTime(d: Date) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Mic button states ────────────────────────────────────────────────────────

type MicState = "idle" | "recording" | "processing";

// ─── Component ────────────────────────────────────────────────────────────────

function DebatePageInner() {
    const searchParams = useSearchParams();
    const sessionIdFromUrl = searchParams.get("session_id");
    const openingFromUrl = searchParams.get("opening");

    const [messages, setMessages] = useState<Message[]>([
        {
            role: "ai",
            text: openingFromUrl ||
                "I've read your document and I'm ready to defend my position. Make your opening argument.",
            timestamp: formatTime(new Date()),
        },
    ]);
    const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [micState, setMicState] = useState<MicState>("idle");
    // Use the session_id minted on the upload page so the backend can correlate
    // the FAISS index (built during upload) with this debate session.
    const [sessionId] = useState(() => sessionIdFromUrl ?? crypto.randomUUID());
    const [sessionEnded, setSessionEnded] = useState(false);
    const [scoreData, setScoreData] = useState<{
        score: { user: number; ai: number };
        summary: string;
    } | null>(null);
    const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const transcriptEndRef = useRef<HTMLDivElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    // ── Send text turn ──────────────────────────────────────────────────────

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;
        setInput("");

        const userMsg: Message = {
            role: "user",
            text,
            timestamp: formatTime(new Date()),
        };
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

            const aiMsg: Message = {
                role: "ai",
                text: data.response,
                timestamp: formatTime(new Date()),
            };
            setMessages([...next, aiMsg]);
            setEvidence(data.evidence ?? []);

            // Play Polly audio if returned
            if (data.audio_url) {
                audioRef.current = new Audio(data.audio_url);
                audioRef.current.play();
            }
        } catch (err) {
            console.error(err);
            setMessages([
                ...next,
                {
                    role: "ai",
                    text: "⚠️ Connection error. Please check the backend.",
                    timestamp: formatTime(new Date()),
                },
            ]);
        }
        setLoading(false);
    };

    // ── Microphone recording ────────────────────────────────────────────────

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
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
            const res = await fetch(`${API_BASE}/transcribe`, {
                method: "POST",
                body: form,
            });
            const data = await res.json();
            if (data.transcript?.trim()) {
                await sendMessage(data.transcript);
            }
        } catch (err) {
            console.error(err);
        }
        setMicState("idle");
    };

    const toggleMic = () => {
        if (micState === "idle") startRecording();
        else if (micState === "recording") stopRecording();
    };

    // ── End session ─────────────────────────────────────────────────────────

    const endSession = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/end-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId }),
            });
            const data = await res.json();
            setScoreData({ score: data.score, summary: data.summary });
            setSessionEnded(true);
        } catch {
            alert("Could not end session. Please try again.");
        }
        setLoading(false);
    };

    // ─────────────────────────────────────────────────────────────────────────

    if (sessionEnded && scoreData) {
        return <ScoreScreen scoreData={scoreData} />;
    }

    return (
        <main className="min-h-screen bg-gray-50 p-4 md:p-6 font-sans">
            <div
                className="grid gap-4 md:gap-6 h-[92vh]"
                style={{ gridTemplateColumns: "1fr 2fr" }}
            >
                {/* ── Evidence Panel ─────────────────────────────────────────── */}
                <aside className="bg-white rounded-3xl shadow-md flex flex-col overflow-hidden">
                    <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                            Retrieved Evidence
                        </p>
                        <h2 className="text-xl font-bold text-gray-900">Document Passages</h2>
                        <p className="text-xs text-gray-400 mt-1">
                            Top chunks the AI used in its last turn
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        {evidence.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-gray-300">
                                <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                                <p className="text-sm">Passages will appear here after the AI responds.</p>
                            </div>
                        ) : (
                            evidence.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() =>
                                        setActiveEvidenceId(
                                            activeEvidenceId === item.id ? null : item.id
                                        )
                                    }
                                    className={`w-full text-left rounded-2xl p-4 border transition-all ${activeEvidenceId === item.id
                                            ? "border-black bg-gray-50 shadow-sm"
                                            : "border-gray-100 bg-gray-50 hover:border-gray-300"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                            Page {item.page}
                                        </span>
                                        {item.score !== undefined && (
                                            <span className="text-xs font-mono bg-black text-white rounded-full px-2 py-0.5">
                                                {Math.round(item.score * 100)}% match
                                            </span>
                                        )}
                                    </div>
                                    <p
                                        className={`text-sm text-gray-700 leading-relaxed ${activeEvidenceId === item.id ? "" : "line-clamp-3"
                                            }`}
                                    >
                                        {item.text}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                {/* ── Debate Panel ───────────────────────────────────────────── */}
                <section className="bg-white rounded-3xl shadow-md flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                                Live Session
                            </p>
                            <h2 className="text-xl font-bold text-gray-900">Debate Arena</h2>
                        </div>
                        <button
                            onClick={endSession}
                            disabled={loading}
                            className="text-sm border border-gray-200 text-gray-500 px-4 py-2 rounded-xl hover:border-red-300 hover:text-red-500 transition disabled:opacity-40"
                        >
                            End &amp; Score
                        </button>
                    </div>

                    {/* Transcript */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                                {/* Avatar */}
                                <div
                                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1 ${msg.role === "ai"
                                            ? "bg-black text-white"
                                            : "bg-gray-200 text-gray-700"
                                        }`}
                                >
                                    {msg.role === "ai" ? "AI" : "U"}
                                </div>

                                {/* Bubble */}
                                <div className={`max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                                    <div
                                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "ai"
                                                ? "bg-gray-100 text-gray-900 rounded-tl-sm"
                                                : "bg-black text-white rounded-tr-sm"
                                            }`}
                                    >
                                        {msg.text}
                                    </div>
                                    {msg.timestamp && (
                                        <span className="text-[10px] text-gray-400 px-1">
                                            {msg.timestamp}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-black text-white flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1">
                                    AI
                                </div>
                                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                                    <ThinkingDots />
                                </div>
                            </div>
                        )}

                        <div ref={transcriptEndRef} />
                    </div>

                    {/* Input bar */}
                    <div className="px-5 py-4 border-t border-gray-100">
                        <div className="flex items-center gap-3">
                            {/* Mic button */}
                            <MicButton state={micState} onToggle={toggleMic} />

                            {/* Text input */}
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage(input);
                                    }
                                }}
                                placeholder={
                                    micState === "recording"
                                        ? "Recording… click mic to stop"
                                        : micState === "processing"
                                            ? "Transcribing…"
                                            : "Type your argument or use the mic…"
                                }
                                disabled={micState !== "idle" || loading}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50 transition"
                            />

                            {/* Send button */}
                            <button
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || loading || micState !== "idle"}
                                className="bg-black text-white w-11 h-11 rounded-2xl flex items-center justify-center hover:opacity-80 transition disabled:opacity-30 flex-shrink-0"
                            >
                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                                </svg>
                            </button>
                        </div>

                        {micState !== "idle" && (
                            <p className="text-xs text-center mt-2 text-gray-400 animate-pulse">
                                {micState === "recording" ? "🔴 Recording — click mic to stop" : "⏳ Transcribing your speech…"}
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}

// ─── Mic Button ───────────────────────────────────────────────────────────────

function MicButton({ state, onToggle }: { state: MicState; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            disabled={state === "processing"}
            title={state === "idle" ? "Start recording" : "Stop recording"}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${state === "recording"
                    ? "bg-red-500 text-white animate-pulse"
                    : state === "processing"
                        ? "bg-gray-200 text-gray-400 cursor-wait"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
        >
            {state === "processing" ? (
                <svg className="animate-spin" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
            ) : (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
            )}
        </button>
    );
}

// ─── Thinking Dots ────────────────────────────────────────────────────────────

function ThinkingDots() {
    return (
        <div className="flex gap-1 items-center h-5">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                />
            ))}
        </div>
    );
}

// ─── Score Screen ─────────────────────────────────────────────────────────────

function ScoreScreen({
    scoreData,
}: {
    scoreData: { score: { user: number; ai: number }; summary: string };
}) {
    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
            <div className="bg-white rounded-3xl shadow-lg p-10 max-w-xl w-full text-center space-y-8">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                        Session Complete
                    </p>
                    <h1 className="text-4xl font-bold text-gray-900">Debate Score</h1>
                </div>

                {/* Score bars */}
                <div className="space-y-4 text-left">
                    <ScoreBar label="You" value={scoreData.score.user} color="bg-black" />
                    <ScoreBar label="AI" value={scoreData.score.ai} color="bg-gray-300" />
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-2xl p-5 text-left">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                        Feedback
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">{scoreData.summary}</p>
                </div>

                <button
                    onClick={() => (window.location.href = "/")}
                    className="bg-black text-white px-8 py-3 rounded-2xl hover:opacity-80 transition"
                >
                    Back to Home
                </button>
            </div>
        </main>
    );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div>
            <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-sm font-bold text-gray-900">{value}/100</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${value}%` }}
                />
            </div>
        </div>
    );
}

export default function DebatePage() {
    return (
        <Suspense fallback={
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-400 text-sm">Loading debate session…</p>
            </main>
        }>
            <DebatePageInner />
        </Suspense>
    );
}