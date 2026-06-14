"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface DebateRecord {
    session_id: string;
    topic_summary: string;
    created_at: string;
    level: "easy" | "intermediate" | "hard";
    filenames: string[];
}

const LEVEL_STYLE: Record<string, { label: string; color: string; bg: string }> = {
    easy:         { label: "Easy",         color: "#10B981", bg: "#ECFDF5" },
    intermediate: { label: "Intermediate", color: "#3B82F6", bg: "#EFF6FF" },
    hard:         { label: "Hard",         color: "#EF4444", bg: "#FEF2F2" },
};

function formatDate(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryPage() {
    const { data: session, status } = useSession();
    const [records, setRecords] = useState<DebateRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const userId = (session?.user as { id?: string } | undefined)?.id;

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        fetch(`${API_BASE}/history/${userId}`)
            .then((r) => r.json())
            .then((data) => { setRecords(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [userId]);

    if (status === "loading") {
        return (
            <main className="min-h-screen flex items-center justify-center bg-white">
                <div style={{ width: 28, height: 28, border: "2px solid #E5E7EB", borderTopColor: "#0A0A0A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </main>
        );
    }

    if (!session) {
        return (
            <main className="min-h-screen flex flex-col items-center justify-center bg-white gap-5" style={{ fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>
                <p style={{ fontSize: 18, color: "#374151", fontWeight: 600 }}>Sign in to see your debate history</p>
                <button
                    onClick={() => signIn("google")}
                    style={{ background: "#0A0A0A", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 15, fontWeight: 500, cursor: "pointer" }}
                >
                    Sign in with Google
                </button>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white" style={{ fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

            {/* Nav */}
            <nav
                className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100"
                style={{ padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                    <div style={{ width: 28, height: 28, background: "#0A0A0A", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#0A0A0A", letterSpacing: "-0.01em" }}>DebateCoach</span>
                </Link>
                <Link href="/upload"
                    style={{ background: "#0A0A0A", color: "white", fontSize: 14, fontWeight: 500, padding: "8px 18px", borderRadius: 9, textDecoration: "none" }}
                    className="hover:opacity-85 transition-opacity">
                    New debate →
                </Link>
            </nav>

            <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px" }}>

                <div style={{ marginBottom: 40 }}>
                    <h1 style={{ fontSize: 30, fontWeight: 700, color: "#0A0A0A", letterSpacing: "-0.02em", marginBottom: 6 }}>
                        My debates
                    </h1>
                    <p style={{ fontSize: 14, color: "#9CA3AF" }}>
                        Signed in as {session.user?.email}
                    </p>
                </div>

                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
                        <div style={{ width: 24, height: 24, border: "2px solid #E5E7EB", borderTopColor: "#0A0A0A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    </div>
                ) : records.length === 0 ? (
                    <div style={{ textAlign: "center", paddingTop: 80 }}>
                        <p style={{ fontSize: 16, color: "#9CA3AF", marginBottom: 24 }}>No debates yet.</p>
                        <Link href="/upload"
                            style={{ background: "#0A0A0A", color: "white", fontSize: 14, fontWeight: 500, padding: "10px 22px", borderRadius: 9, textDecoration: "none" }}
                            className="hover:opacity-85 transition-opacity">
                            Start your first debate
                        </Link>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {records.map((r) => {
                            const ls = LEVEL_STYLE[r.level] ?? LEVEL_STYLE.easy;
                            return (
                                <div
                                    key={r.session_id}
                                    style={{ border: "1px solid #E5E7EB", borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}
                                    className="hover:border-gray-400 transition-colors"
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 15, fontWeight: 500, color: "#0A0A0A", marginBottom: 6, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {r.topic_summary || "Debate session"}
                                        </p>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: ls.color, background: ls.bg, padding: "2px 8px", borderRadius: 999 }}>
                                                {ls.label}
                                            </span>
                                            {r.filenames?.[0] && (
                                                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{r.filenames[0]}</span>
                                            )}
                                            <span style={{ fontSize: 12, color: "#9CA3AF" }}>{formatDate(r.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </main>
    );
}
