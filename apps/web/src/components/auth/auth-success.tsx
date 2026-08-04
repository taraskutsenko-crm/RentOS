import { CheckCircle2 } from "lucide-react";

/**
 * The one genuinely new-account "welcome" moment this chapter uses (the
 * customer-portal invitation activation) — see UX_PRINCIPLES.md rule 20
 * (success messages are specific, past tense). Not used for login/register,
 * which already redirect immediately with no pause worth interrupting.
 */
export function AuthSuccessState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <CheckCircle2 className="text-success size-10" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
