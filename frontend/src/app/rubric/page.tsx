"use client";

import { useState } from "react";
import Link from "next/link";

type Level = "easy" | "intermediate" | "hard";

const LEVELS: { id: Level; label: string; color: string; bg: string }[] = [
    { id: "easy",         label: "Easy",         color: "#16A34A", bg: "#F0FDF4" },
    { id: "intermediate", label: "Intermediate", color: "#2563EB", bg: "#EFF6FF" },
    { id: "hard",         label: "Hard",         color: "#DC2626", bg: "#FFF1F2" },
];

const PERSONAS: Record<Level, { title: string; description: string }> = {
    easy: {
        title: "Supportive Guide",
        description:
            "Uses simple vocabulary and asks one question per round. Does not introduce counter-arguments, focusing on helping you articulate and develop your position clearly.",
    },
    intermediate: {
        title: "Analytical Challenger",
        description:
            "Introduces counter-arguments to test the strength of your reasoning. Expects you to engage directly with opposing claims rather than simply restating your position.",
    },
    hard: {
        title: "Rigorous Adversary",
        description:
            "Uses the uploaded document against you and demands rhetorical precision. Exploits vague language, logical gaps, and inconsistencies without concession.",
    },
};

interface Dimension {
    id: string;
    name: string;
    color: string;
    description: string;
    weights: Partial<Record<Level, number>>;
    activeOn: Level[];
}

const DIMENSIONS: Dimension[] = [
    {
        id: "claim-clarity",
        name: "Claim Clarity",
        color: "#3B82F6",
        description: "How precisely you state your position and whether your claims are specific and falsifiable rather than vague or hedged.",
        weights: { easy: 35, intermediate: 20, hard: 15 },
        activeOn: ["easy", "intermediate", "hard"],
    },
    {
        id: "evidence-integration",
        name: "Evidence Integration",
        color: "#10B981",
        description: "Whether you cite specific passages or data from the document to ground your claims in concrete evidence.",
        weights: { easy: 35, intermediate: 20, hard: 15 },
        activeOn: ["easy", "intermediate", "hard"],
    },
    {
        id: "logical-structure",
        name: "Logical Structure",
        color: "#8B5CF6",
        description: "Whether your argument follows a coherent progression with clear cause-and-effect reasoning and no non-sequiturs.",
        weights: { easy: 30, intermediate: 20, hard: 15 },
        activeOn: ["easy", "intermediate", "hard"],
    },
    {
        id: "rebuttal-quality",
        name: "Rebuttal Quality",
        color: "#F59E0B",
        description: "How effectively you identify and directly counter the specific claims the AI has made, rather than changing the subject.",
        weights: { intermediate: 25, hard: 20 },
        activeOn: ["intermediate", "hard"],
    },
    {
        id: "consistency",
        name: "Consistency",
        color: "#EC4899",
        description: "Whether your position and framing remain coherent across all rounds without unexplained shifts or contradictions.",
        weights: { intermediate: 15, hard: 15 },
        activeOn: ["intermediate", "hard"],
    },
    {
        id: "rhetorical-depth",
        name: "Rhetorical Depth",
        color: "#EF4444",
        description: "The sophistication of your persuasion: use of analogy, ethos, pathos, and deliberate variation in rhetorical register.",
        weights: { hard: 20 },
        activeOn: ["hard"],
    },
];

export default function RubricPage() {
    const [level, setLevel] = useState<Level>("easy");
    const [visible, setVisible] = useState(true);

    const switchLevel = (newLevel: Level) => {
        if (newLevel === level) return;
        setVisible(false);
        setTimeout(() => { setLevel(newLevel); setVisible(true); }, 120);
    };

    const persona = PERSONAS[level];
    const activeLevelCfg = LEVELS.find((l) => l.id === level)!;

    return (
        <main style={{
            minHeight: "100vh", background: "var(--bg)",
            fontFamily: "var(--font-geist-sans), -apple-system, sans-serif",
        }}>

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
                        Start a session
                    </Link>
                </div>
            </nav>

            <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 80px" }}>

                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 44 }}>
                    <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 10 }}>
                        Scoring Rubric
                    </h1>
                    <p style={{ fontSize: 15, color: "var(--text-3)" }}>
                        How your performance is evaluated at each difficulty level.
                    </p>
                </div>

                {/* Level toggle */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 48 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 999, padding: 4, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        {LEVELS.map((l) => (
                            <button
                                key={l.id}
                                onClick={() => switchLevel(l.id)}
                                style={{
                                    padding: "7px 20px", borderRadius: 999, border: "none", cursor: "pointer",
                                    fontSize: 14, fontWeight: 500, transition: "all 0.18s",
                                    background: level === l.id ? "#09090B" : "transparent",
                                    color: level === l.id ? "white" : "#71717A",
                                    boxShadow: level === l.id ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                                }}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Animated content */}
                <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.12s" }}>

                    {/* Opponent persona */}
                    <div style={{
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 20, padding: "32px", textAlign: "center", marginBottom: 16,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    }}>
                        <div style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            background: activeLevelCfg.bg, borderRadius: 999, padding: "4px 12px", marginBottom: 14,
                        }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: activeLevelCfg.color }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: activeLevelCfg.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                Opponent Persona
                            </span>
                        </div>
                        <p style={{ fontSize: 19, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>{persona.title}</p>
                        <p style={{ fontSize: 14, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
                            {persona.description}
                        </p>
                    </div>

                    {/* Dimensions grid */}
                    <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 14, textAlign: "center" }}>
                            Scored Dimensions
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                            {DIMENSIONS.map((dim) => {
                                const isActive = dim.activeOn.includes(level);
                                const weight = dim.weights[level];
                                return (
                                    <div
                                        key={dim.id}
                                        style={{
                                            background: isActive ? "white" : "var(--subtle)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 16, padding: "18px",
                                            opacity: isActive ? 1 : 0.45, transition: "opacity 0.3s",
                                            display: "flex", flexDirection: "column", gap: 12,
                                            boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{dim.name}</span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, flexShrink: 0,
                                                padding: "2px 8px", borderRadius: 999,
                                                background: isActive ? "var(--subtle)" : "var(--subtle)",
                                                color: isActive ? "#52525B" : "#A1A1AA",
                                            }}>
                                                {isActive ? `${weight}%` : "Off"}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.65, flex: 1 }}>{dim.description}</p>
                                        {isActive && (
                                            <div style={{ height: 3, background: "#F4F4F5", borderRadius: 999, overflow: "hidden" }}>
                                                <div style={{
                                                    width: `${weight}%`, height: "100%",
                                                    background: dim.color, borderRadius: 999,
                                                    transition: "width 0.5s ease",
                                                }} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Comparison table */}
                    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, overflow: "hidden", marginBottom: 44, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                        <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: "left", padding: "14px 20px", fontWeight: 500, color: "var(--text-4)", background: "#FAFAFA", borderBottom: "1px solid #F4F4F5" }}>
                                        Dimension
                                    </th>
                                    {LEVELS.map((l) => (
                                        <th key={l.id} style={{
                                            textAlign: "center", padding: "14px 16px", fontWeight: 600,
                                            borderBottom: "1px solid #F4F4F5",
                                            background: level === l.id ? "#09090B" : "var(--bg)",
                                            color: level === l.id ? "white" : "#A1A1AA",
                                            transition: "all 0.2s",
                                        }}>
                                            {l.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {DIMENSIONS.map((dim, idx) => (
                                    <tr key={dim.id} style={{ borderBottom: idx < DIMENSIONS.length - 1 ? "1px solid #F9F9F9" : "none" }}>
                                        <td style={{ padding: "12px 20px", color: "var(--text-2)" }}>{dim.name}</td>
                                        {LEVELS.map((l) => {
                                            const active = dim.activeOn.includes(l.id);
                                            return (
                                                <td key={l.id} style={{
                                                    textAlign: "center", padding: "12px 16px",
                                                    background: level === l.id ? "var(--subtle)" : "white",
                                                    transition: "background 0.2s",
                                                }}>
                                                    {active ? (
                                                        <svg width="15" height="15" fill="none" stroke={l.color} strokeWidth="2.5" viewBox="0 0 24 24" style={{ display: "inline-block" }}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                        </svg>
                                                    ) : (
                                                        <span style={{ color: "#D4D4D8", fontSize: 16 }}>-</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* CTA */}
                    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <Link
                            href="/upload"
                            style={{
                                background: "var(--btn)", color: "var(--btn-fg)",
                                padding: "12px 32px", borderRadius: 12,
                                fontSize: 14, fontWeight: 600, textDecoration: "none",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)",
                            }}
                            className="hover:opacity-85 transition-opacity"
                        >
                            Start a session
                        </Link>
                        <Link
                            href="/result"
                            style={{ fontSize: 12, color: "var(--text-4)", textDecoration: "none" }}
                            className="hover:text-zinc-600 transition-colors"
                        >
                            Preview result template
                        </Link>
                    </div>

                </div>
            </div>
        </main>
    );
}
