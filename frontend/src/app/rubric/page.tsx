"use client";

import { useState } from "react";
import Link from "next/link";

type Level = "easy" | "intermediate" | "hard";

const LEVELS: { id: Level; label: string }[] = [
	{ id: "easy", label: "Easy" },
	{ id: "intermediate", label: "Intermediate" },
	{ id: "hard", label: "Hard" },
];


const PERSONAS: Record<Level, { title: string; description: string }> = {
	easy: {
		title: "Supportive Guide",
		description:
			"Uses simple vocabulary and asks one question per round. Does not introduce counter-arguments, focusing instead on helping you articulate and develop your position clearly.",
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
		description:
			"Measures how precisely you state your position and whether your claims are specific and falsifiable rather than vague or hedged.",
		weights: { easy: 35, intermediate: 20, hard: 15 },
		activeOn: ["easy", "intermediate", "hard"],
	},
	{
		id: "evidence-integration",
		name: "Evidence Integration",
		color: "#10B981",
		description:
			"Evaluates whether you cite specific passages or data from the document to ground your claims in concrete evidence.",
		weights: { easy: 35, intermediate: 20, hard: 15 },
		activeOn: ["easy", "intermediate", "hard"],
	},
	{
		id: "logical-structure",
		name: "Logical Structure",
		color: "#8B5CF6",
		description:
			"Assesses whether your argument follows a coherent progression with clear cause-and-effect reasoning and no non-sequiturs.",
		weights: { easy: 30, intermediate: 20, hard: 15 },
		activeOn: ["easy", "intermediate", "hard"],
	},
	{
		id: "rebuttal-quality",
		name: "Rebuttal Quality",
		color: "#F59E0B",
		description:
			"Measures how effectively you identify and directly counter the specific claims the AI has made, rather than changing the subject.",
		weights: { intermediate: 25, hard: 20 },
		activeOn: ["intermediate", "hard"],
	},
	{
		id: "consistency",
		name: "Consistency",
		color: "#EC4899",
		description:
			"Tracks whether your position and framing remain coherent across all rounds without unexplained shifts or contradictions.",
		weights: { intermediate: 15, hard: 15 },
		activeOn: ["intermediate", "hard"],
	},
	{
		id: "rhetorical-depth",
		name: "Rhetorical Depth",
		color: "#EF4444",
		description:
			"Evaluates the sophistication of your persuasion: use of analogy, ethos, pathos, and deliberate variation in rhetorical register.",
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
		setTimeout(() => {
			setLevel(newLevel);
			setVisible(true);
		}, 120);
	};

	const persona = PERSONAS[level];

	return (
		<main
			className="min-h-screen bg-white px-6 py-14"
			style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
		>
			<div className="max-w-2xl mx-auto">

				{/* Page header */}
				<div className="text-center mb-10">
					<h1 className="text-4xl font-semibold text-gray-900 tracking-tight">
						Scoring Rubric
					</h1>
				</div>

				{/* Level toggle */}
				<div className="flex justify-center mb-14">
					<div className="inline-flex items-center bg-gray-100 rounded-full p-1">
						{LEVELS.map((l) => (
							<button
								key={l.id}
								onClick={() => switchLevel(l.id)}
								className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
									level === l.id
										? "bg-white text-gray-900 shadow-sm"
										: "text-gray-500 hover:text-gray-700"
								}`}
							>
								{l.label}
							</button>
						))}
					</div>
				</div>

				{/* Animated content */}
				<div
					className="transition-opacity duration-[120ms]"
					style={{ opacity: visible ? 1 : 0 }}
				>
					{/* Opponent persona */}
					<section className="mb-12">
						<div className="border border-gray-200 rounded-2xl p-8 text-center">
							<p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
								Opponent persona
							</p>
							<p className="text-xl font-semibold text-gray-900 mb-3">{persona.title}</p>
							<p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
								{persona.description}
							</p>
						</div>
					</section>

					{/* Scored dimensions */}
					<section className="mb-12">
						<p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5 text-center">
							Scored dimensions
						</p>
						<div className="grid grid-cols-3 gap-4">
							{DIMENSIONS.map((dim) => {
								const isActive = dim.activeOn.includes(level);
								const weight = dim.weights[level];

								return (
									<div
										key={dim.id}
										className="border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 transition-opacity duration-300"
										style={{ opacity: isActive ? 1 : 0.35 }}
									>
										<div className="flex items-start justify-between gap-2">
											<span className="text-sm font-semibold text-gray-900 leading-tight">{dim.name}</span>
											{isActive ? (
												<span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
													{weight}%
												</span>
											) : (
												<span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 flex-shrink-0">
													Off
												</span>
											)}
										</div>

										<p className="text-sm text-gray-500 leading-relaxed flex-1">
											{dim.description}
										</p>

										{isActive && (
											<div className="h-1 bg-gray-100 rounded-full overflow-hidden">
												<div
													className="h-full rounded-full transition-all duration-500"
													style={{ width: `${weight}%`, backgroundColor: dim.color }}
												/>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</section>

					{/* Full comparison table */}
					<section className="mb-14">
						<p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5 text-center">
							Full comparison
						</p>
						<div className="border border-gray-200 rounded-2xl overflow-hidden">
							<table className="w-full text-sm">
								<thead>
									<tr>
										<th className="text-left px-5 py-4 font-medium text-gray-500 bg-gray-50 border-b border-gray-200">
											Dimension
										</th>
										{LEVELS.map((l) => (
											<th
												key={l.id}
												className={`text-center px-4 py-4 font-medium border-b border-gray-200 transition-colors ${
													level === l.id
														? "bg-gray-900 text-white"
														: "bg-gray-50 text-gray-500"
												}`}
											>
												{l.label}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{DIMENSIONS.map((dim) => (
										<tr key={dim.id} className="border-b border-gray-100 last:border-0">
											<td className="px-5 py-3.5 text-gray-700">{dim.name}</td>
											{LEVELS.map((l) => {
												const active = dim.activeOn.includes(l.id);
												return (
													<td
														key={l.id}
														className={`text-center px-4 py-3.5 transition-colors ${
															level === l.id ? "bg-gray-50" : "bg-white"
														}`}
													>
														{active ? (
															<span className="text-gray-700 text-base">✓</span>
														) : (
															<span className="text-gray-300">-</span>
														)}
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>

					{/* CTA */}
					<div className="pb-20 flex flex-col items-center gap-4">
						<Link
							href="/upload"
							className="bg-gray-900 text-white px-8 py-3.5 rounded-2xl text-sm font-medium hover:bg-black transition-colors"
						>
							Start a session
						</Link>
						{/* Temporary preview link - remove before shipping */}
						<Link
							href="/result"
							className="text-xs text-gray-400 border border-dashed border-gray-300 px-4 py-1.5 rounded-full hover:text-gray-600 hover:border-gray-400 transition-colors"
						>
							Preview result template
						</Link>
					</div>
				</div>
			</div>
		</main>
	);
}
