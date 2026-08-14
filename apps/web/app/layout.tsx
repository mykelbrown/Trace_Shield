import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DFI — Digital Footprint Intelligence",
  description: "Personal digital footprint & OSINT exposure intelligence platform (local-first self-audit tool).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
            <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-sm">
                  DFI
                </span>
                <span>Digital Footprint Intelligence</span>
              </Link>
              <nav className="flex items-center gap-4 text-sm text-slate-400">
                <span className="hidden sm:inline text-xs uppercase tracking-wide text-slate-500">
                  Local-first · Self-audit only
                </span>
              </nav>
            </div>
          </header>
          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
          <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
            DFI investigates only the identifiers you explicitly supply. No data leaves your machine except requests to
            the OSINT providers you enable. See <code>PRIVACY.md</code> and <code>SECURITY.md</code>.
          </footer>
        </div>
      </body>
    </html>
  );
}
