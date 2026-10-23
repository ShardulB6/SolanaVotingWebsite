import { createFileRoute } from "@tanstack/react-router";
import { CreatePoll } from "../components/create-poll";
import { getCurrentUser } from "../lib/auth";

export const Route = createFileRoute("/dashboard/new")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  loader: () => getCurrentUser(),
  component: NewPoll,
});
function NewPoll() {
  return <CreatePoll user={Route.useLoaderData()} />;
}
