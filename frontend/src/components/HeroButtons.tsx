"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";

export default function HeroButtons({ variant }: { variant: "hero" | "cta" }) {
    const { data: session, status } = useSession();

    if (status === "loading") return <div style={{ height: 48 }} />;

    if (session?.user) {
        // Logged in — single "Start debate session" button
        if (variant === "hero") {
            return (
                <Link href="/upload" style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "white", color: "#08090A",
                    borderRadius: 999, padding: "14px 36px",
                    fontSize: 14, fontWeight: 700, textDecoration: "none",
                    letterSpacing: "0.02em",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
                }}
                    className="hover:opacity-90 transition-opacity">
                    Start debate session →
                </Link>
            );
        }
        return (
            <Link href="/upload" style={{
                background: "white", color: "#08090A", fontWeight: 700, fontSize: 14,
                padding: "13px 28px", borderRadius: 999, textDecoration: "none",
                whiteSpace: "nowrap",
            }}
                className="hover:opacity-90 transition-opacity">
                Start debate session →
            </Link>
        );
    }

    // Not logged in
    if (variant === "hero") {
        return (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
                <Link href="/login" style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "white", color: "#08090A",
                    borderRadius: 999, padding: "14px 32px",
                    fontSize: 14, fontWeight: 700, textDecoration: "none",
                    letterSpacing: "0.02em",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
                }}
                    className="hover:opacity-90 transition-opacity">
                    Create account →
                </Link>
                <Link href="/upload" style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "transparent",
                    border: "1.5px solid rgba(255,255,255,0.28)",
                    color: "rgba(255,255,255,0.75)",
                    borderRadius: 999, padding: "14px 32px",
                    fontSize: 14, fontWeight: 600, textDecoration: "none",
                    letterSpacing: "0.02em",
                }}
                    className="hover:border-white hover:text-white transition-colors">
                    Try without account
                </Link>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            <Link href="/login" style={{
                background: "white", color: "#08090A", fontWeight: 700, fontSize: 14,
                padding: "13px 28px", borderRadius: 999, textDecoration: "none",
                whiteSpace: "nowrap",
            }}
                className="hover:opacity-90 transition-opacity">
                Create account
            </Link>
            <Link href="/upload" style={{
                border: "1.5px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.7)",
                fontWeight: 600, fontSize: 14,
                padding: "13px 28px", borderRadius: 999, textDecoration: "none",
                whiteSpace: "nowrap",
            }}
                className="hover:border-white hover:text-white transition-colors">
                Try without account
            </Link>
        </div>
    );
}
