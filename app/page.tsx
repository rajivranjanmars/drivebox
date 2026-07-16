import {
  ArrowRight,
  Check,
  CloudUpload,
  FileText,
  FolderLock,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: ShieldCheck,
    title: "Private by default",
    description: "Every file is scoped to your account and delivered through authenticated routes.",
  },
  {
    icon: Zap,
    title: "Fast everywhere",
    description: "Built on Cloudflare's global network for a responsive experience wherever you work.",
  },
  {
    icon: FolderLock,
    title: "Simple ownership",
    description: "Your files stay yours—without public bucket URLs or credentials in the browser.",
  },
];

/** Renders a visual preview of the private file workspace. */
function WorkspacePreview(): React.JSX.Element {
  return (
    <div className="surface relative mx-auto w-full max-w-xl overflow-hidden rounded-[1.75rem] p-3 shadow-2xl shadow-indigo-500/10 sm:p-4">
      <div className="rounded-[1.25rem] border bg-card/90 p-4 sm:p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark compact />
            <div>
              <p className="text-xs font-semibold">My workspace</p>
              <p className="text-[10px] text-muted-foreground">3 files · 18.4 MB</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            Secure
          </span>
        </div>

        <div className="mb-4 flex min-h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/25 bg-primary/[0.035] px-4 text-center">
          <span className="mb-2 grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <CloudUpload className="size-4" />
          </span>
          <p className="text-xs font-semibold">Drop files to upload</p>
          <p className="text-[10px] text-muted-foreground">Private, fast, and ready when you are</p>
        </div>

        <div className="space-y-2">
          {[
            { icon: FileText, name: "Project brief.pdf", size: "2.4 MB", tone: "text-rose-500 bg-rose-500/10" },
            { icon: ImageIcon, name: "Launch artwork.png", size: "15.7 MB", tone: "text-violet-500 bg-violet-500/10" },
            { icon: FileText, name: "Meeting notes.txt", size: "3 KB", tone: "text-amber-500 bg-amber-500/10" },
          ].map(({ icon: Icon, name, size, tone }) => (
            <div key={name} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-2.5">
              <span className={`grid size-8 place-items-center rounded-lg ${tone}`}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
              <span className="text-[10px] text-muted-foreground">{size}</span>
              <Check className="size-3.5 text-emerald-500" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Renders the redesigned DriveBox landing page. */
export default function Home(): React.JSX.Element {
  return (
    <main className="overflow-hidden">
      <section className="relative border-b border-border/60 pb-20 pt-16 sm:pb-28 sm:pt-24">
        <div aria-hidden="true" className="grid-fade absolute inset-x-0 top-0 -z-10 h-full opacity-75" />
        <div aria-hidden="true" className="absolute left-1/2 top-10 -z-10 size-[28rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="page-shell grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
            <span className="eyebrow">
              <Sparkles className="size-3.5" />
              Your private cloud workspace
            </span>
            <h1 className="mt-6 text-balance text-5xl font-extrabold tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Files that stay
              <span className="text-gradient block">yours, always.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg lg:mx-0">
              Keep your important files organized, protected, and ready anywhere—without sacrificing speed or privacy.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Start storing securely
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Open your workspace</Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground lg:justify-start">
              {["Private R2 storage", "No public file URLs", "20 MB per file"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-500" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative px-1 sm:px-6 lg:px-0">
            <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-full bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-fuchsia-500/10 blur-3xl" />
            <WorkspacePreview />
          </div>
        </div>
      </section>

      <section className="page-shell py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Built for peace of mind</span>
          <h2 className="mt-5 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            Private storage without the friction
          </h2>
          <p className="mt-4 text-muted-foreground">
            The essentials of a dependable file workspace, thoughtfully simplified.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="surface group rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1">
              <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/10 text-primary transition-transform duration-300 group-hover:scale-105">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-bold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="page-shell pb-20 sm:pb-28">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-12 text-center text-white shadow-2xl shadow-indigo-500/20 sm:px-12 sm:py-16">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_35%)]" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Your files deserve a safer home.</h2>
            <p className="mt-4 text-sm leading-6 text-white/75 sm:text-base">
              Create your private workspace in seconds and keep everything important close.
            </p>
            <Button asChild size="lg" className="mt-7 bg-white text-indigo-700 shadow-xl hover:bg-white/90">
              <Link href="/sign-up">
                Create your workspace
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-7">
        <div className="page-shell flex flex-col items-center justify-between gap-3 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <BrandMark />
          <p>Private storage powered by Cloudflare R2 and D1.</p>
        </div>
      </footer>
    </main>
  );
}
