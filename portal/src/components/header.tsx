import { UserMenu } from "@/components/user-menu";

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <h2 className="text-sm font-medium text-foreground">Portal</h2>
      <UserMenu />
    </header>
  );
}
