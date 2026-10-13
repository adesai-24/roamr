import Link from "next/link";

/** The shell for pages you see before you have a session. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <Link href="/" className="text-2xl font-semibold tracking-tight">
        roamr
      </Link>
      {children}
    </div>
  );
}
