import Link from "next/link";
import AuthButton from "@/components/AuthButton";

const STEPS = [
    {
        n: "01",
        title: "Upload your document",
        body: "Add a PDF: research paper, policy brief, or article. The AI grounds every argument in your source material.",
    },
    {
        n: "02",
        title: "Pick your difficulty",
        body: "Supportive Guide, Analytical Challenger, or Rigorous Adversary. Scale the pressure to where you need to grow.",
    },
    {
        n: "03",
        title: "Debate and get coached",
        body: "Argue live. Receive scored feedback across 6 dimensions: clarity, evidence, logic, rebuttal, consistency, and rhetoric.",
    },
];

const FEATURES = [
    {
        title: "Document-grounded AI",
        body: "Every AI argument is sourced from your upload. No generic talking points. It knows your material cold.",
    },
    {
        title: "Fallacy detection",
        body: "Real-time detection of slippery slopes, false dilemmas, hasty generalisations, and 2 other logical fallacies.",
    },
    {
        title: "Web search",
        body: 'When you cite recent facts, the AI verifies them live using a built-in search. No more unchecked claims.',
    },
    {
        title: "6-dimension scoring",
        body: "Per-dimension coaching after every session: claim clarity, evidence, logic, rebuttal, consistency, rhetorical depth.",
    },
    {
        title: "Email your report",
        body: "Ask the AI to send your coaching report by email at any point during the session. Just type the request.",
    },
    {
        title: "3 difficulty levels",
        body: "From an encouraging guide to a relentless adversary. Train at your current level, then step up.",
    },
];

export default function Home() {
    return (
        <main className="min-h-screen bg-white" style={{ fontFamily: "var(--font-geist-sans), -apple-system, sans-serif" }}>

            {/* ── Nav ───────────────────────────────────────────────────────── */}
            <nav
                className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100"
                style={{ padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, background: "#0A0A0A", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#0A0A0A", letterSpacing: "-0.01em" }}>DebateCoach</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <Link href="/rubric" style={{ fontSize: 14, color: "#6B7280", textDecoration: "none" }}
                        className="hover:text-gray-900 transition-colors">
                        Scoring rubric
                    </Link>
                    <AuthButton />
                    <Link href="/upload"
                        style={{ background: "#0A0A0A", color: "white", fontSize: 14, fontWeight: 500, padding: "8px 18px", borderRadius: 9, textDecoration: "none" }}
                        className="hover:opacity-85 transition-opacity">
                        Start debate →
                    </Link>
                </div>
            </nav>

            {/* ── Hero ──────────────────────────────────────────────────────── */}
            <section style={{ maxWidth: 820, margin: "0 auto", padding: "96px 24px 80px", textAlign: "center" }}>
                <h1 style={{ fontSize: 68, fontWeight: 800, color: "#0A0A0A", lineHeight: 1.04, letterSpacing: "-0.04em", marginBottom: 24, marginTop: 0 }}>
                    Argue better,<br />
                    <span style={{ color: "#9CA3AF" }}>every round.</span>
                </h1>

                <p style={{ fontSize: 20, color: "#6B7280", maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.65 }}>
                    Upload a document. Debate an AI that argues directly from your source.
                    Get coached on 6 dimensions of argumentation, every session.
                </p>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
                    <Link href="/upload" style={{
                        background: "#0A0A0A", color: "white", fontWeight: 600, fontSize: 16,
                        padding: "14px 32px", borderRadius: 12, textDecoration: "none",
                        boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
                    }}
                        className="hover:opacity-85 transition-opacity">
                        Start your first debate
                    </Link>
                    <Link href="/rubric" style={{ fontSize: 15, color: "#6B7280", textDecoration: "underline", textUnderlineOffset: 4 }}
                        className="hover:text-gray-900 transition-colors">
                        View scoring rubric
                    </Link>
                </div>

                {/* Stats */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 48, marginTop: 64, paddingTop: 48, borderTop: "1px solid #F3F4F6" }}>
                    {[
                        { value: "3", label: "Difficulty levels" },
                        { value: "6", label: "Scored dimensions" },
                        { value: "5", label: "Fallacies detected" },
                    ].map((s) => (
                        <div key={s.label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 36, fontWeight: 800, color: "#0A0A0A", letterSpacing: "-0.03em" }}>{s.value}</div>
                            <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── How it works ──────────────────────────────────────────────── */}
            <section style={{ background: "#F9FAFB", borderTop: "1px solid #F3F4F6", borderBottom: "1px solid #F3F4F6", padding: "72px 24px" }}>
                <div style={{ maxWidth: 900, margin: "0 auto" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF", textAlign: "center", marginBottom: 56 }}>
                        How it works
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 40 }}>
                        {STEPS.map((s, i) => (
                            <div key={s.n} style={{ position: "relative" }}>
                                {i < STEPS.length - 1 && (
                                    <div style={{ position: "absolute", top: 18, left: "60%", right: "-40%", height: 1, background: "#E5E7EB" }} />
                                )}
                                <div style={{
                                    width: 36, height: 36, background: "#0A0A0A", color: "white",
                                    borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 13, fontWeight: 700, marginBottom: 16,
                                }}>
                                    {i + 1}
                                </div>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", marginBottom: 8 }}>{s.title}</h3>
                                <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>{s.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features ──────────────────────────────────────────────────── */}
            <section style={{ padding: "72px 24px" }}>
                <div style={{ maxWidth: 900, margin: "0 auto" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF", textAlign: "center", marginBottom: 56 }}>
                        What's inside
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                        {FEATURES.map((f) => (
                            <div key={f.title} style={{
                                border: "1px solid #E5E7EB", borderRadius: 16, padding: "24px",
                                transition: "border-color 0.15s, box-shadow 0.15s",
                            }}
                                className="hover:border-gray-300 hover:shadow-sm transition-all">
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#0A0A0A", marginBottom: 8 }}>{f.title}</h3>
                                <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.65 }}>{f.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA strip ─────────────────────────────────────────────────── */}
            <section style={{ background: "#0A0A0A", padding: "80px 24px", textAlign: "center" }}>
                <div style={{ maxWidth: 560, margin: "0 auto" }}>
                    <h2 style={{ fontSize: 40, fontWeight: 800, color: "white", letterSpacing: "-0.03em", marginBottom: 16 }}>
                        Ready to debate?
                    </h2>
                    <p style={{ fontSize: 16, color: "#9CA3AF", marginBottom: 36, lineHeight: 1.6 }}>
                        Upload a document and start your first session in under a minute.
                    </p>
                    <Link href="/upload" style={{
                        display: "inline-block", background: "white", color: "#0A0A0A",
                        fontWeight: 600, fontSize: 15, padding: "14px 32px", borderRadius: 12, textDecoration: "none",
                    }}
                        className="hover:bg-gray-100 transition-colors">
                        Start a debate →
                    </Link>
                </div>
            </section>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <footer style={{ borderTop: "1px solid #F3F4F6", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#D1D5DB" }}>DebateCoach</span>
                <Link href="/rubric" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}
                    className="hover:text-gray-600 transition-colors">
                    Scoring Rubric
                </Link>
            </footer>

        </main>
    );
}
