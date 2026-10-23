import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { VotingDatabase } from "../db/database.server";
import { ballots, challenges, polls } from "../db/schema";
import { ballotMessage, resultsDigest, verifyBallot, type ResultsRecord } from "./results";
import { pollIsOpen, validatePoll, type Poll, type PollInput } from "./polls-codec";

const now = sql<number>`unixepoch()`;
const counts = Array.from(
  { length: 6 },
  (_, i) => sql<number>`coalesce(sum(case when ${ballots.option} = ${i} then 1 else 0 end), 0)`,
);
const selection = {
  poll: polls,
  c0: counts[0],
  c1: counts[1],
  c2: counts[2],
  c3: counts[3],
  c4: counts[4],
  c5: counts[5],
};
function toPoll(row: {
  poll: typeof polls.$inferSelect;
  c0: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
}): Poll {
  const { poll } = row;
  return {
    ...poll,
    address: poll.id,
    nonce: new Uint8Array(poll.id.match(/../g)!.map((part) => parseInt(part, 16))),
    votes: [row.c0, row.c1, row.c2, row.c3, row.c4, row.c5].slice(0, poll.options.length),
  };
}

export class VotingStore {
  constructor(private db: VotingDatabase) {}

  async list() {
    const rows = await this.db
      .select(selection)
      .from(polls)
      .leftJoin(ballots, eq(ballots.poll, polls.id))
      .where(eq(polls.deleted, false))
      .groupBy(polls.id)
      .orderBy(desc(polls.createdAt), asc(polls.id));
    return rows.map(toPoll);
  }
  async get(id: string) {
    const [row] = await this.db
      .select(selection)
      .from(polls)
      .leftJoin(ballots, eq(ballots.poll, polls.id))
      .where(and(eq(polls.id, id), eq(polls.deleted, false)))
      .groupBy(polls.id);
    return row ? toPoll(row) : null;
  }
  async create(creator: string, id: string, input: PollInput) {
    validatePoll(input);
    await this.db
      .insert(polls)
      .values({ ...input, id, creator, createdAt: Math.floor(Date.now() / 1000) })
      .onConflictDoNothing();
    const poll = await this.get(id);
    // A retry may reuse its nonce, but cannot overwrite an existing question.
    if (
      !poll ||
      poll.creator !== creator ||
      poll.title !== input.title ||
      poll.description !== input.description ||
      JSON.stringify(poll.options) !== JSON.stringify(input.options) ||
      poll.closesAt !== input.closesAt
    )
      throw new Error(
        "This poll identifier is already in use. Reload before creating another poll.",
      );
    return id;
  }
  async receipt(poll: string, voter: string) {
    const [row] = await this.db
      .select()
      .from(ballots)
      .where(and(eq(ballots.poll, poll), eq(ballots.voter, voter)));
    return row ?? null;
  }
  async challenge(pollId: string, voter: string, option: number, origin: string) {
    const poll = await this.get(pollId);
    if (!poll || !pollIsOpen(poll)) throw new Error("Voting has closed.");
    if (!Number.isInteger(option) || option < 0 || option >= poll.options.length)
      throw new Error("Choose a valid option.");
    if (await this.receipt(pollId, voter))
      throw new Error("This wallet has already voted in this poll.");
    const expiresAt = Math.min(poll.closesAt, Math.floor(Date.now() / 1000) + 300);
    const message = ballotMessage({
      origin,
      poll: pollId,
      voter,
      option,
      question: poll.title,
      choice: poll.options[option],
      nonce: crypto.randomUUID(),
      expiresAt,
    });
    await this.db
      .insert(challenges)
      .values({ poll: pollId, voter, option, message, expiresAt })
      .onConflictDoUpdate({
        target: [challenges.poll, challenges.voter],
        set: { option, message, expiresAt },
      });
    return message;
  }
  async vote(pollId: string, voter: string, message: string, signature: string, origin: string) {
    const [challenge] = await this.db
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.poll, pollId),
          eq(challenges.voter, voter),
          eq(challenges.message, message),
        ),
      );
    if (
      !challenge ||
      JSON.parse(challenge.message).origin !== origin ||
      challenge.expiresAt <= Date.now() / 1000
    )
      throw new Error("Your vote request expired. Please try again.");
    if (!(await verifyBallot({ voter, option: challenge.option, message, signature })))
      throw new Error("We couldn't verify your vote signature.");
    // This single INSERT checks closure/deadline/challenge and uniqueness inside
    // SQLite. Concurrent votes and a concurrent close/delete cannot bypass it.
    const inserted = await this.db
      .insert(ballots)
      .select(
        this.db
          .select({
            poll: challenges.poll,
            voter: challenges.voter,
            option: challenges.option,
            message: challenges.message,
            signature: sql<string>`${signature}`.as("signature"),
            receivedAt: now.as("received_at"),
          })
          .from(challenges)
          .innerJoin(polls, eq(polls.id, challenges.poll))
          .where(
            and(
              eq(challenges.poll, pollId),
              eq(challenges.voter, voter),
              eq(challenges.message, message),
              sql`${challenges.expiresAt} > ${now}`,
              eq(polls.closed, false),
              eq(polls.deleted, false),
              sql`${polls.closesAt} > ${now}`,
              sql`${challenges.option} < json_array_length(${polls.options})`,
            ),
          ),
      )
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) {
      if (await this.receipt(pollId, voter))
        throw new Error("This wallet has already voted in this poll.");
      throw new Error("Voting closed or your vote request expired. Refresh before trying again.");
    }
    return inserted[0];
  }
  async change(id: string, creator: string, action: "close" | "delete") {
    const rows = await this.db
      .update(polls)
      .set({ closed: true, ...(action === "delete" ? { deleted: true } : {}) })
      .where(and(eq(polls.id, id), eq(polls.creator, creator), eq(polls.deleted, false)))
      .returning({ id: polls.id });
    if (!rows.length) throw new Error("Only the creator can change an available poll.");
  }
  async results(id: string) {
    const poll = await this.get(id);
    if (!poll) throw new Error("Poll unavailable.");
    if (pollIsOpen(poll)) throw new Error("End voting before publishing final results.");
    const rows = await this.db
      .select({
        voter: ballots.voter,
        option: ballots.option,
        message: ballots.message,
        signature: ballots.signature,
      })
      .from(ballots)
      .where(eq(ballots.poll, id))
      .orderBy(asc(ballots.voter));
    const record: ResultsRecord = {
      format: "huskyvote-results-v1",
      poll: {
        id,
        creator: poll.creator,
        title: poll.title,
        description: poll.description,
        options: poll.options,
        createdAt: poll.createdAt,
        closesAt: poll.closesAt,
      },
      counts: poll.votes,
      ballots: rows,
    };
    return {
      record,
      digest: await resultsDigest(record),
      anchorSignature: poll.anchorSignature ?? null,
    };
  }
  async saveAnchor(id: string, creator: string, digest: string, signature: string) {
    const updated = await this.db
      .update(polls)
      .set({ anchorSignature: signature, anchorDigest: digest })
      .where(
        and(
          eq(polls.id, id),
          eq(polls.creator, creator),
          eq(polls.deleted, false),
          sql`${polls.anchorSignature} IS NULL`,
        ),
      )
      .returning({ signature: polls.anchorSignature });
    if (!updated.length) {
      const poll = await this.get(id);
      if (poll?.anchorDigest !== digest || poll.anchorSignature !== signature)
        throw new Error("This poll already has a different results anchor.");
    }
    return signature;
  }
}
