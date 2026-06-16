import Link from "next/link";
import AuthButtonWrapper from "@/components/AuthButtonWrapper";
import HeroButtonsWrapper from "@/components/HeroButtonsWrapper";

const STEPS = [
    {
        n: "01",
        title: "Upload your document",
        body: "Add any PDF. The AI grounds every argument strictly in your source material — no hallucinations.",
    },
    {
        n: "02",
        title: "Pick your difficulty",
        body: "Supportive Guide, Analytical Challenger, or Rigorous Adversary — each changes how hard the AI pushes back.",
    },
    {
        n: "03",
        title: "Debate, then get scored",
        body: "Argue live. Receive a breakdown across 6 dimensions the moment the session ends.",
    },
];

const FEATURES = [
    {
        icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z",
        title: "Document-grounded arguments",
        body: "Every AI rebuttal is sourced from your upload. No generic talking points.",
    },
    {
        icon: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z",
        title: "Real-time fallacy detection",
        body: "Slippery slopes, false dilemmas, hasty generalisations — flagged as you argue.",
    },
    {
        icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
        title: "6-dimension score breakdown",
        body: "Claim clarity, evidence, logic, rebuttal, consistency, rhetorical depth.",
    },
    {
        icon: "M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75",
        title: "Email coaching report",
        body: "Full session analysis delivered to your inbox at the end of every debate.",
    },
    {
        icon: "M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.25 9.71 2 12 2c2.291 0 4.545.25 6.75.721v1.515m0 0c.982.143 1.954.317 2.916.52a6.003 6.003 0 0 1-5.395 5.492M18.75 4.236V4.5a6.728 6.728 0 0 1-2.48 5.228",
        title: "Saved debate history",
        body: "Sign in to track sessions over time and revisit past coaching reports.",
    },
];

export default function Home() {
    return (
        <main style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

            {/* Nav */}
            <nav style={{
                position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
                padding: "0 40px", height: 64,
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <ellipse cx="21.8432" cy="40" rx="21.8432" ry="40" transform="matrix(-0.659044 0.752104 0.752104 0.659044 49.791 18.9385)" fill="white"/>
                        <ellipse cx="65.4794" cy="61.7286" rx="21.8432" ry="40" transform="rotate(48.773 65.4794 61.7286)" fill="white"/>
                    </svg>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "white", letterSpacing: "-0.01em" }}>DebateCoach</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                    <AuthButtonWrapper />
                </div>
            </nav>

            {/* Hero — full viewport, black */}
            <section style={{
                minHeight: "100vh",
                background: "#08090A",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                textAlign: "center",
                padding: "120px 40px 80px",
                position: "relative",
                overflow: "hidden",
            }}>
                <h1 style={{
                    fontSize: "clamp(52px, 7vw, 88px)",
                    fontWeight: 800,
                    color: "white",
                    letterSpacing: "-0.04em",
                    lineHeight: 1.04,
                    marginBottom: 24,
                    maxWidth: 780,
                }}>
                    Argue better,<br />
                    <span style={{ color: "#D0E7FF" }}>every round.</span>
                </h1>

                <p style={{
                    fontSize: 18, color: "rgba(255,255,255,0.5)",
                    maxWidth: 460, lineHeight: 1.75, marginBottom: 56,
                }}>
                    Upload a document, debate an AI that argues directly from it,
                    and get coached on 6 dimensions every session.
                </p>

                <HeroButtonsWrapper variant="hero" />

                {/* Stats */}
                <div style={{
                    marginTop: 80,
                    paddingTop: 48, borderTop: "1px solid rgba(255,255,255,0.08)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 32,
                }}>
                    <div style={{ display: "flex", gap: 56 }}>
                        {[
                            { value: "3", label: "Difficulty levels" },
                            { value: "6", label: "Scored dimensions" },
                            { value: "5+", label: "Fallacy types detected" },
                        ].map((s) => (
                            <div key={s.label} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 34, fontWeight: 800, color: "white", letterSpacing: "-0.03em", lineHeight: 1 }}>{s.value}</div>
                                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                    <Link href="/rubric" style={{
                        fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none",
                        display: "flex", alignItems: "center", gap: 5,
                    }}
                        className="hover:text-white transition-colors">
                        See how scoring works
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </Link>
                </div>
            </section>

            {/* How it works */}
            <section style={{ background: "#D0E7FF", borderBottom: "1px solid #BFDBFE" }}>
                <div style={{ maxWidth: 1080, margin: "0 auto", padding: "80px 40px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 64 }}>
                        <div style={{ paddingTop: 4 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#08090A" }}>How it works</p>
                        </div>
                        <div>
                            {STEPS.map((s, i) => (
                                <div key={s.n} style={{
                                    display: "grid", gridTemplateColumns: "56px 1fr", gap: 24,
                                    paddingBottom: i < STEPS.length - 1 ? 36 : 0,
                                    marginBottom: i < STEPS.length - 1 ? 36 : 0,
                                    borderBottom: i < STEPS.length - 1 ? "1px solid var(--border)" : "none",
                                }}>
                                    <span style={{ fontSize: 40, fontWeight: 800, color: "white", letterSpacing: "-0.04em", lineHeight: 1, paddingTop: 2 }}>{s.n}</span>
                                    <div>
                                        <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 8, letterSpacing: "-0.01em" }}>{s.title}</h3>
                                        <p style={{ fontSize: 15, color: "var(--text-3)", lineHeight: 1.7 }}>{s.body}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
                <div style={{ maxWidth: 1080, margin: "0 auto", padding: "80px 40px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 64 }}>
                        <div style={{ paddingTop: 4 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-4)" }}>What&apos;s inside</p>
                        </div>
                        <div>
                            {FEATURES.map((f, i) => (
                                <div key={f.title} style={{
                                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32,
                                    paddingBottom: i < FEATURES.length - 1 ? 28 : 0,
                                    marginBottom: i < FEATURES.length - 1 ? 28 : 0,
                                    borderBottom: i < FEATURES.length - 1 ? "1px solid var(--border)" : "none",
                                    alignItems: "baseline",
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 32, height: 32, background: "#D0E7FF", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <svg width="15" height="15" fill="none" stroke="#CBD5E1" strokeWidth="1.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                                            </svg>
                                        </div>
                                        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{f.title}</span>
                                    </div>
                                    <p style={{ fontSize: 14, color: "var(--text-3)", lineHeight: 1.65 }}>{f.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA strip */}
            <section style={{ background: "#08090A" }}>
                <div style={{
                    maxWidth: 1080, margin: "0 auto", padding: "80px 40px",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40,
                }}>
                    <div>
                        <h2 style={{ fontSize: 36, fontWeight: 800, color: "white", letterSpacing: "-0.03em", marginBottom: 8 }}>
                            Ready to debate?
                        </h2>
                        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.65 }}>
                            Upload a document and start your first session in under a minute.
                        </p>
                    </div>
                    <HeroButtonsWrapper variant="cta" />
                </div>
            </section>

            {/* Footer */}
            <footer style={{ borderTop: "1px solid var(--border)", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--card)" }}>
                <span style={{ fontSize: 13, color: "var(--text-4)" }}>DebateCoach</span>
                <div style={{ display: "flex", gap: 24 }}>
                    <Link href="/rubric" style={{ fontSize: 13, color: "var(--text-4)", textDecoration: "none" }}
                        className="hover:text-zinc-600 transition-colors">
                        Scoring Rubric
                    </Link>
                    <Link href="/history" style={{ fontSize: 13, color: "var(--text-4)", textDecoration: "none" }}
                        className="hover:text-zinc-600 transition-colors">
                        History
                    </Link>
                </div>
            </footer>

        </main>
    );
}
