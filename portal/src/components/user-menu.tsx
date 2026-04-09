"use client";

import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function UserMenu() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  const initials = (session.user.name ?? session.user.email ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Avatar>
        {session.user.image ? (
          <AvatarImage src={session.user.image} alt={session.user.name ?? ""} />
        ) : (
          <AvatarFallback>{initials}</AvatarFallback>
        )}
      </Avatar>
      <div className="hidden flex-col md:flex">
        <span className="text-sm font-medium text-foreground">
          {session.user.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {session.user.email}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => signOut({ callbackUrl: "/" })}
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
