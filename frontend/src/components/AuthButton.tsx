"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

export default function AuthButton() {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--subtle)" }} />;
    }

    if (session?.user) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Link href="/history" style={{ fontSize: 14, color: "var(--text-3)", textDecoration: "none" }}
                    className="hover:text-zinc-900 transition-colors">
                    My debates
                </Link>
                <Link href="/settings" style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 999, padding: "4px 12px 4px 6px", textDecoration: "none",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
                    className="hover:border-zinc-300 transition-colors">
                    {session.user.image && (
                        <Image src={session.user.image} alt="avatar" width={22} height={22} style={{ borderRadius: "50%" }} />
                    )}
                    <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                        {session.user.name?.split(" ")[0] ?? "Account"}
                    </span>
                </Link>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
                href="/login"
                style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 9, padding: "7px 14px", textDecoration: "none",
                    fontSize: 14, color: "var(--text-2)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
                className="hover:border-zinc-300 transition-colors"
            >
                Sign in
            </Link>
        </div>
    );
}
