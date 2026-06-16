"use client";

import dynamic from "next/dynamic";

const HeroButtons = dynamic(() => import("./HeroButtons"), { ssr: false });

export default function HeroButtonsWrapper({ variant }: { variant: "hero" | "cta" }) {
    return <HeroButtons variant={variant} />;
}
