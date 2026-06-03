import Image from "next/image";
import Link from "next/link";

export default function Home() {
    return (
        <main className="min-h-screen bg-white flex items-center justify-center px-6">
            <div className="max-w-3xl text-center flex flex-col items-center gap-8">
                {/* Centered Image */}
                <Image
                    src="/images/debate.jpg"
                    alt="Debate AI"
                    width={300}
                    height={75}
                    className="rounded-3xl shadow-xl object-cover"
                />

                <div className="space-y-4">
                    <h1 className="text-5xl font-bold tracking-tight text-gray-900">
                        Debate Ideas With AI
                    </h1>

                    <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
                        This is your Debate Chatbot! If you want to improve your debate skills
                        and get meaningful feedback, this is the place for you!
                        Upload an article, paper, or policy brief and debate an AI that
                        takes a position grounded in the document. Speak naturally, receive
                        live responses, and improve your argumentation skills with detailed
                        post-debate feedback.
                    </p>
                </div>

                {/* Button */}
                <Link
                    href="/upload"
                    className="bg-black text-white px-8 py-4 rounded-2xl text-lg font-medium hover:opacity-80 transition"
                >
                    Get Started
                </Link>
            </div>
        </main>
    );
}


//export default function Home() {
//  return (
//    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
//      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
//        <Image
//          src="/images/debate.jpg"
//          alt="Debate logo"
//          width={200}
//          height={50}
//          priority
//        />
//        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
//          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
//            Hi!
//          </h1>
//          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
//            This is your Debate Chatbot! If you want to improve your debate skills and get meaningful feedback, this is the place for you!
//            <a
//              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//              className="font-medium text-zinc-950 dark:text-zinc-50"
//            >
//              Templates
//            </a>{" "}
//            or the{" "}
//            <a
//              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//              className="font-medium text-zinc-950 dark:text-zinc-50"
//            >
//              Learning
//            </a>{" "}
//            center.
//          </p>
//        </div>
//        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
//          <a
//            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
//            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//            target="_blank"
//            rel="noopener noreferrer"
//          >
//            <Image
//              className="dark:invert"
//              src="/vercel.svg"
//              alt="Vercel logomark"
//              width={16}
//              height={16}
//            />
//            Deploy Now
//          </a>
//          <a
//            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
//            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//            target="_blank"
//            rel="noopener noreferrer"
//          >
//            Documentation
//          </a>
//        </div>
//      </main>
//    </div>
//  );
////}
