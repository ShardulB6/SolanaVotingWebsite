import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const id = z.string().regex(/^[0-9a-f]{32}$/);
const wallet = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const pollInput = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(280),
  options: z.array(z.string().min(1).max(60)).min(2).max(6),
  closesAt: z.number().int(),
});

export const listPolls = createServerFn({ method: "GET" }).handler(async () => {
  const { votingService } = await import("./voting-service.server");
  return (await votingService()).store.list();
});
export const readPoll = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) => {
    const { votingService } = await import("./voting-service.server");
    return (await votingService()).store.get(data);
  });
export const readReceipt = createServerFn({ method: "GET" })
  .validator(z.object({ poll: id, voter: wallet }))
  .handler(async ({ data }) => {
    const { votingService } = await import("./voting-service.server");
    return (await votingService()).store.receipt(data.poll, data.voter);
  });
export const insertPoll = createServerFn({ method: "POST" })
  .validator(z.object({ id, input: pollInput }))
  .handler(async ({ data }) => {
    const { votingService } = await import("./voting-service.server");
    const service = await votingService();
    return service.store.create(await service.user(), data.id, data.input);
  });
export const requestVote = createServerFn({ method: "POST" })
  .validator(z.object({ poll: id, option: z.number().int().min(0).max(5) }))
  .handler(async ({ data }) => {
    const { votingService } = await import("./voting-service.server");
    const service = await votingService();
    return service.store.challenge(data.poll, await service.user(), data.option, service.origin);
  });
export const submitVote = createServerFn({ method: "POST" })
  .validator(
    z.object({
      poll: id,
      message: z.string().min(1).max(2048),
      signature: z.string().min(80).max(90),
    }),
  )
  .handler(async ({ data }) => {
    const { votingService } = await import("./voting-service.server");
    const service = await votingService();
    return service.store.vote(
      data.poll,
      await service.user(),
      data.message,
      data.signature,
      service.origin,
    );
  });
export const changePoll = createServerFn({ method: "POST" })
  .validator(z.object({ poll: id, action: z.enum(["close", "delete"]) }))
  .handler(async ({ data }) => {
    const { votingService } = await import("./voting-service.server");
    const service = await votingService();
    return service.store.change(data.poll, await service.user(), data.action);
  });
export const readResults = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) => {
    const { votingService } = await import("./voting-service.server");
    return (await votingService()).store.results(data);
  });
export const recordAnchor = createServerFn({ method: "POST" })
  .validator(z.object({ poll: id, signature: z.string().min(80).max(90) }))
  .handler(async ({ data }) => {
    const { saveVerifiedAnchor } = await import("./voting-service.server");
    return saveVerifiedAnchor(data.poll, data.signature);
  });
export const checkAnchor = createServerFn({ method: "GET" })
  .validator(id)
  .handler(async ({ data }) => {
    const { checkPublishedAnchor } = await import("./voting-service.server");
    return checkPublishedAnchor(data);
  });
