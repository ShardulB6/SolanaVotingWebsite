import { createFileRoute } from "@tanstack/react-router";

import { LoginForm } from "../components/login-form";
import { getCurrentUser } from "../lib/auth";

export const Route = createFileRoute("/")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  loader: () => getCurrentUser(),
  component: HomeComponent,
});

function HomeComponent() {
  const user = Route.useLoaderData();
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-[#f7f7f5] px-5 py-10 md:p-10">
      <div className="w-full max-w-sm md:max-w-5xl">
        <LoginForm user={user} />
      </div>
    </main>
  );
}
