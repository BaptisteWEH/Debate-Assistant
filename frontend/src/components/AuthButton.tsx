"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

export default function AuthButton() {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F3F4F6" }} />;
    }

    if (session?.user) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Link
                    href="/history"
                    style={{ fontSize: 14, color: "#6B7280", textDecoration: "none" }}
                    className="hover:text-gray-900 transition-colors"
                >
                    My debates
                </Link>
                <button
                    onClick={() => signOut()}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "1px solid #E5E7EB", borderRadius: 999, padding: "4px 12px 4px 6px", cursor: "pointer" }}
                    className="hover:border-gray-400 transition-colors"
                >
                    {session.user.image && (
                        <Image
                            src={session.user.image}
                            alt="avatar"
                            width={22}
                            height={22}
                            style={{ borderRadius: "50%" }}
                        />
                    )}
                    <span style={{ fontSize: 13, color: "#374151" }}>Sign out</span>
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => signIn("google")}
            style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "white", border: "1px solid #E5E7EB",
                borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontSize: 14, color: "#374151",
            }}
            className="hover:border-gray-400 transition-colors"
        >
            <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in
        </button>
    );
}
