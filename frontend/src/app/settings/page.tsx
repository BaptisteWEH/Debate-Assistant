"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

type Level = "easy" | "intermediate" | "hard";

const LEVEL_OPTIONS: { id: Level; label: string; color: string }[] = [
    { id: "easy",         label: "Easy",         color: "#16A34A" },
    { id: "intermediate", label: "Intermediate", color: "#2563EB" },
    { id: "hard",         label: "Hard",         color: "#DC2626" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 14 }}>
                {title}
            </p>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                {children}
            </div>
        </div>
    );
}

function Row({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", gap: 16,
            borderBottom: last ? "none" : "1px solid var(--border)",
        }}>
            <span style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>{children}</div>
        </div>
    );
}

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const [defaultLevel, setDefaultLevel] = useState<Level>("easy");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("dc-default-level") as Level | null;
        if (saved) setDefaultLevel(saved);
    }, []);

    const handleLevelChange = (l: Level) => {
        setDefaultLevel(l);
        localStorage.setItem("dc-default-level", l);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const user = session?.user;

    return (
        <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

            {/* Nav */}
            <nav style={{
                position: "sticky", top: 0, zIndex: 20,
                background: "var(--nav)", backdropFilter: "blur(12px)",
                borderBottom: "1px solid var(--border)",
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
            </nav>

            <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 24px 80px" }}>

                <div style={{ marginBottom: 40 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em", marginBottom: 6 }}>Settings</h1>
                    <p style={{ fontSize: 14, color: "var(--text-3)" }}>Manage your account and preferences.</p>
                </div>

                {/* Profile */}
                {status === "authenticated" && user && (
                    <Section title="Profile">
                        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px", borderBottom: "1px solid var(--border)" }}>
                            {user.image ? (
                                <Image
                                    src={user.image} alt="avatar"
                                    width={52} height={52}
                                    style={{ borderRadius: "50%", border: "2px solid var(--border)" }}
                                />
                            ) : (
                                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--subtle)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="22" height="22" fill="none" stroke="var(--text-3)" strokeWidth="1.8" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                    </svg>
                                </div>
                            )}
                            <div>
                                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{user.name ?? "User"}</p>
                                <p style={{ fontSize: 13, color: "var(--text-3)" }}>{user.email}</p>
                            </div>
                        </div>
                        <Row label="Account type" last>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--subtle)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 12px" }}>
                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)" }} />
                                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Free plan</span>
                            </div>
                        </Row>
                    </Section>
                )}

                {status === "unauthenticated" && (
                    <Section title="Profile">
                        <div style={{ padding: "28px 20px", textAlign: "center" }}>
                            <p style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 16 }}>Sign in to manage your profile and access debate history.</p>
                            <Link href="/login" style={{
                                display: "inline-flex", alignItems: "center", gap: 8,
                                background: "var(--btn)", color: "var(--btn-fg)",
                                borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 600,
                                textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                            }}>
                                Sign in
                            </Link>
                        </div>
                    </Section>
                )}

                {/* Preferences */}
                <Section title="Preferences">
                    <div style={{ padding: "18px 20px" }}>
                        <p style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, marginBottom: 12 }}>Default difficulty</p>
                        <div style={{ display: "flex", gap: 8 }}>
                            {LEVEL_OPTIONS.map((l) => (
                                <button
                                    key={l.id}
                                    onClick={() => handleLevelChange(l.id)}
                                    style={{
                                        flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                                        background: defaultLevel === l.id ? "var(--btn)" : "var(--subtle)",
                                        color: defaultLevel === l.id ? "var(--btn-fg)" : "var(--text-3)",
                                        fontSize: 13, fontWeight: defaultLevel === l.id ? 600 : 400,
                                        cursor: "pointer", transition: "all 0.15s",
                                        boxShadow: defaultLevel === l.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                    }}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                        {saved && (
                            <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
                                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                Saved
                            </p>
                        )}
                    </div>
                </Section>

                {/* Account */}
                <Section title="Account">
                    <Row label="Connected accounts">
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            <span style={{ fontSize: 13, color: "var(--text-2)" }}>Google</span>
                            {session && (
                                <svg width="13" height="13" fill="none" stroke="var(--text-2)" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            )}
                        </div>
                    </Row>
                    <Row label="Session history" last>
                        <Link href="/history" style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                            View all
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </Link>
                    </Row>
                </Section>

                {/* Sign out */}
                {session && (
                    <Section title="Danger zone">
                        <div style={{ padding: "18px 20px" }}>
                            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.6 }}>
                                Signing out will end your current session. Your debate history is saved to your account.
                            </p>
                            <button
                                onClick={() => signOut({ callbackUrl: "/" })}
                                style={{
                                    background: "none", border: "1px solid #FECDD3",
                                    color: "#DC2626", borderRadius: 10, padding: "9px 18px",
                                    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                                    transition: "all 0.15s",
                                }}
                            >
                                Sign out
                            </button>
                        </div>
                    </Section>
                )}

                {/* About */}
                <Section title="About">
                    <Row label="Version">
                        <span style={{ fontSize: 13, color: "var(--text-4)", fontVariantNumeric: "tabular-nums" }}>0.1.0</span>
                    </Row>
                    <Row label="Scoring rubric">
                        <Link href="/rubric" style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                            View
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </Link>
                    </Row>
                    <Row label="Report an issue" last>
                        <a href="mailto:rysa0126@gmail.com" style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                            Contact
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </a>
                    </Row>
                </Section>

            </div>
        </main>
    );
}
