import { Button } from "@rentos/ui";
import { APP_NAME, APP_TAGLINE } from "@rentos/shared";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      <p className="text-muted-foreground">{APP_TAGLINE}</p>
      <Button>Get Started</Button>
    </main>
  );
}
