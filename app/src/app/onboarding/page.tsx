import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/session";
import OnboardingForm from "./form";

export default async function OnboardingPage() {
  const { me } = await requirePlayer({ allowUnonboarded: true });
  if (me.onboarded_at) redirect("/");
  return (
    <main className="min-h-screen grid place-items-center px-4 py-8">
      <OnboardingForm userId={me.id} initialName={me.display_name} />
    </main>
  );
}
