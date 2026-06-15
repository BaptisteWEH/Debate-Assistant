"use client";

import dynamic from "next/dynamic";

const AuthButton = dynamic(() => import("./AuthButton"), { ssr: false });

export default function AuthButtonWrapper() {
    return <AuthButton />;
}
