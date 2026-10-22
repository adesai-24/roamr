import Image from "next/image";
import Link from "next/link";

/** The shell for pages you see before you have a session. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Link href="/" aria-label="roamr home" className="text-3xl font-semibold tracking-tight">
          roamr<span aria-hidden="true">✳</span>
        </Link>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-12">
          {children}
        </div>
      </div>
      <aside className="relative hidden lg:block" aria-hidden="true">
        <Image
          src="/landing/zion.jpg"
          alt=""
          fill
          sizes="50vw"
          className="object-cover object-[center_60%]"
          priority
        />
        <div className="text-background absolute right-12 bottom-12 left-12">
          <p className="text-2xl font-medium tracking-tight">A little further. A little closer.</p>
          <p className="mt-2 text-sm tracking-wide uppercase opacity-80">
            Zion National Park, Utah, USA
          </p>
        </div>
      </aside>
    </div>
  );
}
