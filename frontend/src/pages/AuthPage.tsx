import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Check, FolderKanban, ListTodo, Target, Users } from "lucide-react";
import { GoalSyncBrand } from "@/components/GoalSyncBrand";

export function AuthPage() {
  return (
    <main className="auth-background min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">
        <header><GoalSyncBrand /></header>
        <div className="grid items-center gap-10 py-12 lg:min-h-[calc(100svh-120px)] lg:grid-cols-[0.85fr_1.5fr] lg:gap-12">
          <section className="max-w-lg">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold tracking-wide text-primary">
              <span className="size-1.5 rounded-full bg-primary" /> SMALL STEPS. SHARED PROGRESS.
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl xl:text-6xl">
              Big goals.<br />Better <span className="text-primary">together.</span>
            </h1>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
              Turn your plans into progress. Bring your projects, daily tasks, and people together in one focused workspace.
            </p>
            <div className="relative my-8 flex h-48 max-w-sm items-center justify-center" aria-hidden="true">
              <div className="absolute size-44 rounded-full border border-primary/15" />
              <div className="absolute size-32 rounded-full border border-dashed border-primary/25" />
              <div className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/15"><Target className="size-10" /></div>
              <span className="absolute left-0 top-4 flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-xs font-medium shadow-sm"><Check className="size-4 text-primary" /> One step closer</span>
              <span className="absolute bottom-3 right-0 flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-xs font-medium shadow-sm"><Users className="size-4 text-primary" /> In sync, together</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-2"><FolderKanban className="size-4 text-primary" aria-hidden="true" /> Plan projects</span>
              <span className="inline-flex items-center gap-2"><ListTodo className="size-4 text-primary" aria-hidden="true" /> Take action</span>
              <span className="inline-flex items-center gap-2"><Users className="size-4 text-primary" aria-hidden="true" /> Stay connected</span>
            </div>
          </section>
          <section aria-label="Join or sign in" className="min-w-0">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight">Your next milestone starts here.</h2>
              <p className="mt-2 text-sm text-muted-foreground">New here? Create an account. Already part of the team? Welcome back.</p>
            </div>
            <div className="grid items-start gap-5 md:grid-cols-2">
              <RegisterForm />
              <LoginForm />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
