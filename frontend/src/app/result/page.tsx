"use client";

import { useRef, useState } from "react";
import Link from "next/link";

// ─── Skeleton animation (injected as a style tag) ──────────────────────────
const shimmerStyle = `
	@keyframes shimmer {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.45; }
	}
	.skeleton {
		background: #f3f4f6;
		border-radius: 6px;
		animation: shimmer 1.8s ease-in-out infinite;
	}
`;

// ─── Skeleton line helper ──────────────────────────────────────────────────
function SkeletonLine({ width = "100%", height = 14 }: { width?: string; height?: number }) {
	return (
		<div
			className="skeleton"
			style={{ width, height, borderRadius: 6, background: "#f3f4f6" }}
		/>
	);
}

function SkeletonPill({ width = 80 }: { width?: number }) {
	return (
		<div
			className="skeleton"
			style={{ width, height: 22, borderRadius: 999, background: "#f3f4f6", display: "inline-block" }}
		/>
	);
}

// ─── Ring SVG ─────────────────────────────────────────────────────────────
function Ring({ size = 130, strokeWidth = 7 }: { size?: number; strokeWidth?: number }) {
	const r = 50;
	const cx = size / 2;
	const cy = size / 2;
	const scale = (size / 2 - strokeWidth / 2) / r;
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
			<circle
				cx={cx}
				cy={cy}
				r={r * scale}
				fill="none"
				stroke="#e5e7eb"
				strokeWidth={strokeWidth}
			/>
			<text
				x={cx}
				y={cy + 5}
				textAnchor="middle"
				fill="#9ca3af"
				fontSize={size === 90 ? 16 : 22}
				fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
				fontWeight="500"
			>
				—
			</text>
		</svg>
	);
}

// ─── Dimension data ────────────────────────────────────────────────────────
const DIMENSIONS = [
	{ name: "Claim clarity",        color: "#1D9E75" },
	{ name: "Evidence integration", color: "#378ADD" },
	{ name: "Logical structure",    color: "#7F77DD" },
	{ name: "Rebuttal quality",     color: "#D85A30" },
	{ name: "Consistency",          color: "#BA7517" },
];

// ─── Qualitative cards ─────────────────────────────────────────────────────
const QUAL_CARDS = [
	{
		title: "Strongest argument",
		iconBg: "#E1F5EE",
		iconColor: "#0F6E56",
		icon: (
			<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3-3h-15a3 3 0 0 1 3 3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
			</svg>
		),
		body: (
			<div className="flex flex-col gap-3">
				<div className="border-l-2 border-gray-200 pl-3 flex flex-col gap-1.5">
					<SkeletonLine width="100%" height={12} />
					<SkeletonLine width="85%" height={12} />
					<SkeletonLine width="70%" height={12} />
				</div>
				<div className="flex flex-col gap-2 mt-1">
					<SkeletonLine width="100%" />
					<SkeletonLine width="65%" />
				</div>
			</div>
		),
	},
	{
		title: "Weakest point",
		iconBg: "#FBEAF0",
		iconColor: "#993556",
		icon: (
			<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
			</svg>
		),
		body: (
			<div className="flex flex-col gap-2">
				<SkeletonLine width="100%" />
				<SkeletonLine width="85%" />
				<SkeletonLine width="55%" />
			</div>
		),
	},
	{
		title: "Missed opportunity",
		iconBg: "#FAEEDA",
		iconColor: "#854F0B",
		icon: (
			<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
			</svg>
		),
		body: (
			<div className="flex flex-col gap-2">
				<SkeletonLine width="100%" />
				<SkeletonLine width="75%" />
			</div>
		),
	},
	{
		title: "Argument pattern",
		iconBg: "#E6F1FB",
		iconColor: "#185FA5",
		icon: (
			<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
			</svg>
		),
		body: (
			<div className="flex flex-col gap-2">
				<SkeletonLine width="100%" />
				<SkeletonLine width="85%" />
				<SkeletonLine width="60%" />
			</div>
		),
	},
	{
		title: "AI's assessment of your position",
		iconBg: "#F1EFE8",
		iconColor: "#5F5E5A",
		icon: (
			<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
				<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
			</svg>
		),
		body: (
			<div className="flex flex-col gap-3">
				<SkeletonPill width={100} />
				<div className="flex flex-col gap-2">
					<SkeletonLine width="100%" />
					<SkeletonLine width="75%" />
				</div>
			</div>
		),
	},
];

// ─── PDF Report Card ───────────────────────────────────────────────────────
function ReportCard() {
	const META_ROWS = [
		["Topic", "Level"],
		["Document", "Date"],
		["Rounds", "Duration"],
	];

	return (
		<div
			id="pdf-capture"
			style={{
				border: "1px solid #e5e7eb",
				borderRadius: 12,
				overflow: "hidden",
				fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
				background: "#ffffff",
			}}
		>
			{/* Report header */}
			<div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb" }}>
				<p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 12 }}>
					Debate Coach — Session Report
				</p>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 32px" }}>
					{META_ROWS.map(([left, right]) => (
						<div key={left} style={{ display: "contents" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<span style={{ fontSize: 11, color: "#9ca3af", width: 64, flexShrink: 0 }}>{left}</span>
								<div className="skeleton" style={{ flex: 1, height: 12, background: "#f3f4f6", borderRadius: 4 }} />
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<span style={{ fontSize: 11, color: "#9ca3af", width: 64, flexShrink: 0 }}>{right}</span>
								<div className="skeleton" style={{ flex: 1, height: 12, background: "#f3f4f6", borderRadius: 4 }} />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Score row */}
			<div style={{ display: "grid", gridTemplateColumns: "150px 1fr", borderBottom: "1px solid #e5e7eb" }}>
				<div style={{ padding: "20px 24px", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
					<p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", alignSelf: "flex-start" }}>Overall</p>
					<Ring size={90} strokeWidth={7} />
					<SkeletonPill width={70} />
				</div>
				<div style={{ padding: "20px 24px" }}>
					<p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: 12 }}>Breakdown</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{DIMENSIONS.map((d) => (
							<div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
								<div style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
								<span style={{ fontSize: 11, color: "#374151", width: 130, flexShrink: 0 }}>{d.name}</span>
								<div style={{ flex: 1, height: 5, background: "#f3f4f6", borderRadius: 999 }} />
								<span style={{ fontSize: 11, color: "#9ca3af", width: 16, textAlign: "right" }}>—</span>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Text sections */}
			{["Strengths", "Areas for improvement", "Pattern observed", "Next challenge"].map((label, i) => (
				<div key={label} style={{ padding: "16px 24px", borderBottom: i < 3 ? "1px solid #e5e7eb" : "none" }}>
					<p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 10 }}>
						{label}
					</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						<div className="skeleton" style={{ height: 11, background: "#f3f4f6", borderRadius: 4, width: "100%" }} />
						<div className="skeleton" style={{ height: 11, background: "#f3f4f6", borderRadius: 4, width: "82%" }} />
						{i !== 2 && <div className="skeleton" style={{ height: 11, background: "#f3f4f6", borderRadius: 4, width: "60%" }} />}
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function ResultPage() {
	const downloadBtnRef = useRef<HTMLButtonElement>(null);
	const [email, setEmail] = useState("");
	const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

	// Shared: captures the report card and returns a jsPDF instance
	const buildPdf = async () => {
		const el = document.getElementById("pdf-capture");
		if (!el) return null;

		const noPrint = document.querySelectorAll<HTMLElement>(".no-print");
		noPrint.forEach((n) => (n.style.visibility = "hidden"));

		const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
			import("html2canvas"),
			import("jspdf"),
		]);

		const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
		const imgData = canvas.toDataURL("image/png");
		const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
		const pageWidth = pdf.internal.pageSize.getWidth();
		const imgHeight = (canvas.height * pageWidth) / canvas.width;
		pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);

		noPrint.forEach((n) => (n.style.visibility = ""));
		return pdf;
	};

	const handleDownload = async () => {
		const pdf = await buildPdf();
		if (!pdf) return;
		pdf.save("debate-report-template.pdf");
	};

	const handleSendEmail = async () => {
		if (!email.trim()) return;
		setEmailStatus("sending");
		try {
			const pdf = await buildPdf();
			if (!pdf) throw new Error("PDF generation failed");
			const pdfBase64 = pdf.output("datauristring");
			const res = await fetch("http://localhost:3001/api/email-test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userEmail: email, pdfBase64 }),
			});
			const data = await res.json();
			setEmailStatus(data.success ? "success" : "error");
		} catch {
			setEmailStatus("error");
		}
	};

	return (
		<>
			<style>{shimmerStyle}</style>
			<main
				className="min-h-screen bg-white"
				style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
			>
				{/* ── Top bar ──────────────────────────────────────────────────── */}
				<div
					className="no-print"
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: "20px 32px",
						borderBottom: "1px solid #e5e7eb",
					}}
				>
					<Link
						href="/"
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 8,
							fontSize: 14,
							color: "#374151",
							textDecoration: "none",
							border: "1px solid #e5e7eb",
							padding: "8px 16px",
							borderRadius: 10,
						}}
					>
						<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
						</svg>
						back to home
					</Link>

					<button
						ref={downloadBtnRef}
						onClick={handleDownload}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 8,
							fontSize: 14,
							color: "#374151",
							background: "white",
							border: "1px solid #e5e7eb",
							padding: "8px 16px",
							borderRadius: 10,
							cursor: "pointer",
						}}
					>
						<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
						</svg>
						download PDF
					</button>
				</div>

				<div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>

					{/* ── Score hero ───────────────────────────────────────────── */}
					<div style={{ textAlign: "center", marginBottom: 48 }}>
						<Ring size={130} strokeWidth={7} />
						<div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 8 }}>
							<SkeletonPill width={90} />
							<SkeletonPill width={80} />
						</div>
						<div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
							<div className="skeleton" style={{ width: 220, height: 14, background: "#f3f4f6", borderRadius: 6 }} />
						</div>
					</div>

					{/* ── Score breakdown ───────────────────────────────────────── */}
					<section style={{ marginBottom: 40 }}>
						<p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 12 }}>
							Score breakdown
						</p>
						<div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
							{DIMENSIONS.map((d, i) => (
								<div
									key={d.name}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 12,
										padding: "14px 20px",
										borderBottom: i < DIMENSIONS.length - 1 ? "1px solid #f3f4f6" : "none",
									}}
								>
									<div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
									<span style={{ fontSize: 14, color: "#374151", width: 160, flexShrink: 0 }}>{d.name}</span>
									<div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 999 }} />
									<span style={{ fontSize: 14, color: "#9ca3af", width: 20, textAlign: "right" }}>—</span>
								</div>
							))}
						</div>
					</section>

					{/* ── Qualitative analysis ──────────────────────────────────── */}
					<section style={{ marginBottom: 40 }}>
						<p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 12 }}>
							Qualitative analysis
						</p>
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							{QUAL_CARDS.map((card) => (
								<div
									key={card.title}
									style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 20px" }}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
										<div
											style={{
												width: 30,
												height: 30,
												borderRadius: 8,
												background: card.iconBg,
												color: card.iconColor,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												flexShrink: 0,
											}}
										>
											{card.icon}
										</div>
										<span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{card.title}</span>
									</div>
									{card.body}
								</div>
							))}
						</div>
					</section>

					{/* ── Send report by email ──────────────────────────────────── */}
					<section style={{ marginBottom: 40 }}>
						<p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 12 }}>
							Send report
						</p>
						<div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "24px" }}>
							<p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
								Enter an email to receive the debate report as a PDF attachment.
							</p>
							<div style={{ display: "flex", gap: 10 }}>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="your@email.com"
									style={{
										flex: 1,
										border: "1px solid #e5e7eb",
										borderRadius: 8,
										padding: "10px 14px",
										fontSize: 14,
										outline: "none",
										fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
									}}
								/>
								<button
									onClick={handleSendEmail}
									disabled={emailStatus === "sending" || !email.trim()}
									style={{
										background: "#111827",
										color: "white",
										border: "none",
										borderRadius: 8,
										padding: "10px 20px",
										fontSize: 14,
										cursor: emailStatus === "sending" || !email.trim() ? "not-allowed" : "pointer",
										opacity: emailStatus === "sending" || !email.trim() ? 0.5 : 1,
										fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
										whiteSpace: "nowrap",
									}}
								>
									{emailStatus === "sending" ? "Sending..." : "Send PDF to my email"}
								</button>
							</div>
							{emailStatus === "success" && (
								<p style={{ marginTop: 10, fontSize: 13, color: "#16a34a" }}>Sent! Check your inbox.</p>
							)}
							{emailStatus === "error" && (
								<p style={{ marginTop: 10, fontSize: 13, color: "#dc2626" }}>Something went wrong. Try again.</p>
							)}
						</div>
					</section>

					{/* ── What's next ───────────────────────────────────────────── */}
					<section style={{ marginBottom: 60 }}>
						<p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 16 }}>
							What's next
						</p>
						<div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
							<button
								disabled
								style={{
									flex: 1,
									padding: "12px 0",
									borderRadius: 12,
									border: "1px solid #e5e7eb",
									background: "white",
									fontSize: 14,
									color: "#374151",
									cursor: "not-allowed",
									opacity: 0.4,
								}}
							>
								Retry at same level
							</button>
							<button
								disabled
								style={{
									flex: 1,
									padding: "12px 0",
									borderRadius: 12,
									border: "none",
									background: "#111827",
									fontSize: 14,
									color: "white",
									cursor: "not-allowed",
									opacity: 0.4,
								}}
							>
								Challenge yourself
							</button>
						</div>
						<p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
							results will appear once the debate ends
						</p>
					</section>

				</div>

				{/* Off-screen report card — captured by html2canvas on PDF download, never visible */}
				<div style={{ position: "fixed", left: "-9999px", top: 0, width: 640, pointerEvents: "none" }}>
					<ReportCard />
				</div>
			</main>
		</>
	);
}
