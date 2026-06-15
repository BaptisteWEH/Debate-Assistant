"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

type Mode = "signin" | "signup";

export default function LoginPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [mode, setMode] = useState<Mode>("signin");
    const [email, setEmail] = useState("");
    const [emailSent, setEmailSent] = useState(false);

    useEffect(() => {
        if (session) router.replace("/");
    }, [session, router]);

    if (status === "loading" || session) return null;

    const handleEmailSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email.trim()) setEmailSent(true);
    };

    return (
        <main style={{
            minHeight: "100vh",
            background: "var(--bg)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "80px 24px 40px",
            fontFamily: "var(--font-geist-sans), -apple-system, sans-serif",
            position: "relative",
        }}>
            <style>{`
                @keyframes orb-pulse {
                    0%,100% { box-shadow: 0 0 0 16px rgba(15,23,42,0.06), 0 0 0 32px rgba(15,23,42,0.02), 0 8px 32px rgba(0,0,0,0.2); }
                    50%      { box-shadow: 0 0 0 20px rgba(15,23,42,0.1), 0 0 0 40px rgba(15,23,42,0.04), 0 12px 40px rgba(0,0,0,0.28); }
                }
                .orb-anim { animation: orb-pulse 3s ease-in-out infinite; }
                .auth-input:focus { border-color: var(--text) !important; outline: none; }
                .google-btn:hover { opacity: 0.88; }
                .mode-link:hover { opacity: 0.7; }
            `}</style>

            {/* Top bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                    <svg width="26" height="26" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                        <ellipse cx="21.8432" cy="40" rx="21.8432" ry="40" transform="matrix(-0.659044 0.752104 0.752104 0.659044 49.791 18.9385)" fill="currentColor"/>
                        <ellipse cx="65.4794" cy="61.7286" rx="21.8432" ry="40" transform="rotate(48.773 65.4794 61.7286)" fill="currentColor"/>
                    </svg>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", letterSpacing: "-0.01em" }}>DebateCoach</span>
                </Link>
            </div>

            {/* Main content */}
            <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center" }}>

                {/* Orb */}
                <div className="orb-anim" style={{
                    width: 76, height: 76,
                    background: "linear-gradient(145deg, #475569 0%, #1E293B 50%, #0F172A 100%)",
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 32,
                }}>
                    <svg width="34" height="34" fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                </div>

                {/* Heading */}
                <h1 style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.035em", textAlign: "center", marginBottom: 10, lineHeight: 1.1 }}>
                    {mode === "signin" ? "Welcome back" : "Get started free"}
                </h1>
                <p style={{ fontSize: 15, color: "var(--text-3)", textAlign: "center", marginBottom: 36, lineHeight: 1.65, maxWidth: 320 }}>
                    {mode === "signin"
                        ? "Sign in to access your debate history and coaching reports."
                        : "Create your account and start practising argumentation today."}
                </p>

                {/* Card */}
                <div style={{
                    width: "100%",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 22,
                    padding: "32px 28px",
                    boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
                }}>
                    {/* Google */}
                    <button
                        className="google-btn"
                        onClick={() => signIn("google", { callbackUrl: "/" })}
                        style={{
                            width: "100%",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                            background: "var(--btn)", color: "var(--btn-fg)",
                            border: "none", borderRadius: 13, padding: "14px 20px",
                            fontSize: 15, fontWeight: 600, cursor: "pointer",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)",
                            marginBottom: 22, transition: "opacity 0.15s", fontFamily: "inherit",
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>

                    {/* Divider */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        <span style={{ fontSize: 12, color: "var(--text-4)", fontWeight: 500, whiteSpace: "nowrap" }}>or with email</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    </div>

                    {emailSent ? (
                        <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: "50%",
                                background: "var(--subtle)", border: "1px solid var(--border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "0 auto 16px",
                            }}>
                                <svg width="22" height="22" fill="none" stroke="var(--text-2)" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            </div>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Check your inbox</p>
                            <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.65 }}>
                                We sent a sign-in link to<br />
                                <span style={{ fontWeight: 600, color: "var(--text)" }}>{email}</span>
                            </p>
                            <button
                                onClick={() => { setEmailSent(false); setEmail(""); }}
                                style={{ marginTop: 18, fontSize: 13, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
                            >
                                Use a different email
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <input
                                className="auth-input"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email address"
                                required
                                style={{
                                    width: "100%", border: "1px solid var(--border)",
                                    borderRadius: 11, padding: "12px 14px", fontSize: 14,
                                    background: "var(--input)", color: "var(--text)",
                                    outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
                                }}
                            />
                            {mode === "signup" && (
                                <input
                                    className="auth-input"
                                    type="text"
                                    placeholder="Display name"
                                    style={{
                                        width: "100%", border: "1px solid var(--border)",
                                        borderRadius: 11, padding: "12px 14px", fontSize: 14,
                                        background: "var(--input)", color: "var(--text)",
                                        outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
                                    }}
                                />
                            )}
                            <button
                                type="submit"
                                disabled={!email.trim()}
                                style={{
                                    width: "100%",
                                    background: email.trim() ? "var(--btn)" : "var(--subtle)",
                                    color: email.trim() ? "var(--btn-fg)" : "var(--text-4)",
                                    border: "none", borderRadius: 11, padding: "12px 20px",
                                    fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                                    cursor: email.trim() ? "pointer" : "not-allowed",
                                    transition: "all 0.15s",
                                    boxShadow: email.trim() ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                }}
                            >
                                {mode === "signin" ? "Send magic link →" : "Create account →"}
                            </button>
                        </form>
                    )}
                </div>

                {/* Mode toggle */}
                <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 22, textAlign: "center" }}>
                    {mode === "signin" ? "New to DebateCoach? " : "Already have an account? "}
                    <button
                        className="mode-link"
                        onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setEmailSent(false); setEmail(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontWeight: 600, fontSize: 13, fontFamily: "inherit", padding: 0, transition: "opacity 0.15s" }}
                    >
                        {mode === "signin" ? "Sign up" : "Sign in"}
                    </button>
                </p>

                <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 20, textAlign: "center", maxWidth: 280, lineHeight: 1.7 }}>
                    By continuing, you agree to our Terms of Service and acknowledge our Privacy Policy.
                </p>
            </div>
        </main>
    );
}
