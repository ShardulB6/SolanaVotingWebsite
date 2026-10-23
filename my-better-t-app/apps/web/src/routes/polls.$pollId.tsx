import { createFileRoute } from "@tanstack/react-router";
import { PollRoom } from "../components/poll-room";
import { getCurrentUser } from "../lib/auth";

export const Route = createFileRoute("/polls/$pollId")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  loader: () => getCurrentUser(),
  component: PollPage,
});
function PollPage() {
  return <PollRoom pollId={Route.useParams().pollId} user={Route.useLoaderData()} />;
}
