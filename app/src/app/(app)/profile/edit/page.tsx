import { requirePlayer } from "@/lib/session";
import EditForm from "./form";

export default async function EditProfilePage() {
  const { me } = await requirePlayer();
  return <EditForm me={me} />;
}
