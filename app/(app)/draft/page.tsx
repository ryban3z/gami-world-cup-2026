import { redirect } from "next/navigation";

// The draft now lives on the home dashboard. Keep this route as a redirect so
// old links/bookmarks still work.
export default function DraftPage() {
  redirect("/home");
}
