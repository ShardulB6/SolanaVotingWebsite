import { getRequestUrl, setResponseHeader } from "@tanstack/react-start/server";
import { getDatabase } from "../db/database.server";
import { getAuthSession } from "./session.server";
import { VotingStore } from "./voting-store.server";
import { getConnection } from "./solana";
import { verifyAnchor } from "./anchor.server";
import { verifyResultsRecord } from "./results";

export async function votingService() {
  setResponseHeader("Cache-Control", "private, no-store");
  return {
    store: new VotingStore(await getDatabase()),
    origin: getRequestUrl().origin,
    user: async () => {
      const session = await getAuthSession();
      if (!session.user) throw new Error("Sign in with your Solana wallet first.");
      return session.user.address;
    },
  };
}
export async function saveVerifiedAnchor(poll: string, signature: string) {
  const service = await votingService();
  const creator = await service.user();
  const { record, digest } = await service.store.results(poll);
  if (record.poll.creator !== creator) throw new Error("Only the creator can publish results.");
  if (!(await verifyResultsRecord(record)))
    throw new Error("The results record contains invalid ballots.");
  await verifyAnchor(getConnection(), signature, creator, poll, digest);
  return service.store.saveAnchor(poll, creator, digest, signature);
}
export async function checkPublishedAnchor(poll: string) {
  const { store } = await votingService();
  const { record, digest, anchorSignature } = await store.results(poll);
  if (!anchorSignature) throw new Error("These results have not been anchored on Solana yet.");
  if (!(await verifyResultsRecord(record)))
    throw new Error("The results record contains invalid ballots.");
  await verifyAnchor(getConnection(), anchorSignature, record.poll.creator, poll, digest);
  return { digest, signature: anchorSignature };
}
