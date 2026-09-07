import AppShell from "@/components/AppShell";
import { SharedRecordProvider } from "@/lib/shared";

export default function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /* The shared record's poller lives above the shell, so the nav's dot, the
       export sheet and the pre-flight screen all read one status rather than
       three timers asking the same question on three different beats. */
    <SharedRecordProvider>
      <AppShell>{children}</AppShell>
    </SharedRecordProvider>
  );
}
