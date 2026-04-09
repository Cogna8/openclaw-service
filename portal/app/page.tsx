import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";

export default async function HomePage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-sm space-y-8 text-center px-4">
        <div className="space-y-1">
          <span className="text-2xl font-bold text-primary">cogna8</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            OpenClaw Portal
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your OpenClaw account, API keys, and agents.
          </p>
        </div>
        <SignInButton />
      </div>
    </div>
  );
}
