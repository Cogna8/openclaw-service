import { auth } from "@/lib/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            Welcome{session?.user?.name ? `, ${session.user.name}` : ""}
          </CardTitle>
          <CardDescription>
            Your OpenClaw account is active and ready to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {session?.user?.openclawAccountId && (
            <p>
              Account ID:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {session.user.openclawAccountId}
              </code>
            </p>
          )}
          <p>
            API key management is coming in the next update. You will be able to
            create and manage keys to authenticate with the OpenClaw evaluation
            API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
