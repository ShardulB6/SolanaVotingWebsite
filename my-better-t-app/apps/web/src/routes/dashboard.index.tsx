import { createFileRoute } from "@tanstack/react-router";
import { PollDashboard } from "../components/poll-dashboard";
import { getCurrentUser } from "../lib/auth";

export const Route = createFileRoute("/dashboard/")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  loader: () => getCurrentUser(),
  component: Dashboard,
});

function Dashboard() {
  return <PollDashboard user={Route.useLoaderData()} />;
}
