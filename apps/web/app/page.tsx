import { redirect } from "next/navigation";
import { auth } from "../auth";
import Dashboard from "../src/App";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <Dashboard user={{ name: session.user.name ?? "Nexus User", role: session.user.role }}/>;
}
