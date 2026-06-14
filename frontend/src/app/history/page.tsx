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
    easy:         { label: "Easy",         color: "#16A34A", bg: "#F0FDF4" },
    intermediate: { label: "Intermediate", color: "#2563EB", bg: "#EFF6FF" },
    hard:         { label: "Hard",         color: "#DC2626", bg: "#FFF1F2" },
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
            <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ width: 24, height: 24, border: "2px solid #E4E4E7", borderTopColor: "#09090B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </main>
        );
    }

    if (!session) {
        return (
            <main style={{
                minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 20,
                fontFamily: "var(--font-geist-sans), -apple-system, sans-serif",
            }}>
                <div style={{
                    width: 48, height: 48, background: "var(--card)", borderRadius: 14,
                    border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
                }}>
                    <svg width="22" height="22" fill="none" stroke="#52525B" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                </div>
                <p style={{ fontSize: 18, color: "var(--text)", fontWeight: 600, letterSpacing: "-0.01em" }}>Sign in to see your debate history</p>
                <p style={{ fontSize: 14, color: "var(--text-3)" }}>Your past debates are saved to your account</p>
                <button
                    onClick={() => signIn("google")}
                    style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: "var(--btn)", color: "var(--btn-fg)", border: "none",
                        borderRadius: 11, padding: "10px 22px", fontSize: 14, fontWeight: 600,
                        cursor: "pointer", marginTop: 4,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)",
                    }}
                    className="hover:opacity-85 transition-opacity"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                </button>
            </main>
        );
    }

    return (
        <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* Nav */}
            <nav style={{
                position: "sticky", top: 0, zIndex: 20,
                background: "var(--nav)", backdropFilter: "blur(12px)",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
                padding: "0 32px", height: 58,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                    <svg width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                        <ellipse cx="21.8432" cy="40" rx="21.8432" ry="40" transform="matrix(-0.659044 0.752104 0.752104 0.659044 49.791 18.9385)" fill="currentColor"/>
                        <ellipse cx="65.4794" cy="61.7286" rx="21.8432" ry="40" transform="rotate(48.773 65.4794 61.7286)" fill="currentColor"/>
                    </svg>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", letterSpacing: "-0.01em" }}>DebateCoach</span>
                </Link>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Link href="/upload" style={{
                        background: "var(--btn)", color: "var(--btn-fg)", fontSize: 13, fontWeight: 600,
                        padding: "7px 16px", borderRadius: 9, textDecoration: "none",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                        className="hover:opacity-85 transition-opacity">
                        New debate
                    </Link>
                </div>
            </nav>

            <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px" }}>

                <div style={{ marginBottom: 40 }}>
                    <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 6 }}>
                        My debates
                    </h1>
                    <p style={{ fontSize: 14, color: "var(--text-4)" }}>
                        {session.user?.email}
                    </p>
                </div>

                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
                        <div style={{ width: 24, height: 24, border: "2px solid #E4E4E7", borderTopColor: "#09090B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    </div>
                ) : records.length === 0 ? (
                    <div style={{ textAlign: "center", paddingTop: 80 }}>
                        <p style={{ fontSize: 16, color: "var(--text-4)", marginBottom: 24 }}>No debates yet.</p>
                        <Link href="/upload" style={{
                            background: "var(--btn)", color: "var(--btn-fg)", fontSize: 14, fontWeight: 600,
                            padding: "10px 22px", borderRadius: 9, textDecoration: "none",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                        }}
                            className="hover:opacity-85 transition-opacity">
                            Start your first debate
                        </Link>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {records.map((r) => {
                            const ls = LEVEL_STYLE[r.level] ?? LEVEL_STYLE.easy;
                            return (
                                <div
                                    key={r.session_id}
                                    style={{
                                        background: "var(--card)", border: "1px solid var(--border)",
                                        borderRadius: 14, padding: "20px 24px",
                                        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                        transition: "box-shadow 0.15s, border-color 0.15s",
                                    }}
                                    className="hover:border-zinc-300 hover:shadow-sm"
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 15, fontWeight: 500, color: "var(--text)", marginBottom: 8, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {r.topic_summary || "Debate session"}
                                        </p>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: ls.color, background: ls.bg, padding: "2px 9px", borderRadius: 999 }}>
                                                {ls.label}
                                            </span>
                                            {r.filenames?.[0] && (
                                                <span style={{ fontSize: 12, color: "var(--text-4)" }}>{r.filenames[0]}</span>
                                            )}
                                            <span style={{ fontSize: 12, color: "#D4D4D8" }}>{formatDate(r.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
