// app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HeroLanding from "./_components/home/HeroLanding";

export default async function Home() {
  const access = cookies().get("access")?.value;
  if (access) redirect("/dashboard");

  return <HeroLanding />;
}





