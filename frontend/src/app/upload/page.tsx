"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type UploadState = "idle" | "uploading" | "error";

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [uploadState, setUploadState] = useState<UploadState>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const router = useRouter();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) {
            setFile(f);
            setErrorMsg("");
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) {
            setFile(f);
            setErrorMsg("");
        }
    };

    const handleStartDebate = async () => {
        if (!file) {
            setErrorMsg("Please upload a document before continuing.");
            return;
        }

        setUploadState("uploading");
        setErrorMsg("");

        // Generate a session ID here so it travels with the file and then to
        // the debate page via the URL query param — the debate page reads it
        // from searchParams instead of generating its own.
        const sessionId = crypto.randomUUID();

        const form = new FormData();
        form.append("file", file);
        form.append("session_id", sessionId);

        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: "POST",
                body: form,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail ?? `Server error ${res.status}`);
            }

            const data = await res.json();

            // Pass session_id and the AI's opening statement to the debate page
            // so it can pre-seed the first AI message without an extra round-trip.
            const params = new URLSearchParams({
                session_id: data.session_id ?? sessionId,
                opening: data.opening_statement ?? "",
            });

            router.push(`/debate?${params.toString()}`);
        } catch (err: any) {
            setErrorMsg(err.message ?? "Upload failed. Please try again.");
            setUploadState("error");
        }
    };

    const isUploading = uploadState === "uploading";

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
            <div className="bg-white p-10 rounded-3xl shadow-lg w-full max-w-xl text-center space-y-6">
                <h1 className="text-4xl font-bold text-gray-900">Upload Your Document</h1>
                <p className="text-gray-600">
                    Upload a paper, article, or policy brief to begin your debate.
                </p>
                <Link
                    href="/rubric"
                    className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors"
                >
                    See scoring rubric
                </Link>

                {/* Drop zone */}
                <label
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-12 block cursor-pointer transition ${isDragging
                            ? "border-black bg-gray-50"
                            : "border-gray-300 hover:border-black"
                        }`}
                >
                    <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={handleFileChange}
                        disabled={isUploading}
                    />
                    <p className="text-gray-500">Click to upload or drag &amp; drop</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, TXT</p>
                </label>

                {/* Selected file */}
                {file && (
                    <div className="bg-gray-100 rounded-xl p-4 flex items-center justify-between">
                        <div className="text-left">
                            <p className="text-xs text-gray-500">Selected file</p>
                            <p className="font-medium text-black truncate max-w-xs">{file.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {(file.size / 1024).toFixed(0)} KB
                            </p>
                        </div>
                        {!isUploading && (
                            <button
                                onClick={() => setFile(null)}
                                className="text-gray-400 hover:text-black transition text-xl leading-none ml-4"
                                aria-label="Remove file"
                            >
                                ×
                            </button>
                        )}
                    </div>
                )}

                {/* Error */}
                {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

                {/* Submit */}
                <button
                    onClick={handleStartDebate}
                    disabled={isUploading || !file}
                    className="bg-black text-white px-6 py-3 rounded-2xl hover:opacity-80 transition disabled:opacity-40 w-full flex items-center justify-center gap-2"
                >
                    {isUploading ? (
                        <>
                            <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            Processing document…
                        </>
                    ) : (
                        "Start Debate"
                    )}
                </button>

                {isUploading && (
                    <p className="text-xs text-gray-400 animate-pulse">
                        Uploading to S3, building FAISS index, generating opening statement…
                    </p>
                )}
            </div>
        </main>
    );
}