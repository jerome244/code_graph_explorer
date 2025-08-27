import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import RegisterForm from "@/components/RegisterForm";
import { cookies } from "next/headers";

export default function Home() {
  const hasAccess = Boolean(cookies().get("access"));
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-bold">Welcome</h1>
      {hasAccess ? (
        <section className="space-y-2">
          <p>You are logged in.</p>
          <form action="/api/auth/logout" method="post">
            <button className="border rounded p-2" type="submit">Logout</button>
          </form>
        </section>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <LoginForm />
          <RegisterForm />
        </div>
      )}
      <footer className="text-sm text-gray-500">
        <p>After login/register you are redirected back to this home page.</p>
      </footer>
    </main>
  );
}