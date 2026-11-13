import { requirePlayer } from "@/lib/session";
import { Card } from "@/components/ui";
import SettingsForm from "./form";

export default async function SettingsPage() {
  const { user } = await requirePlayer();
  return (
    <Card className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-extrabold text-love-700">Cài đặt</h1>
      <p className="text-sm text-love-700/70">Đăng nhập bằng: {user.email}</p>
      <SettingsForm />
    </Card>
  );
}
