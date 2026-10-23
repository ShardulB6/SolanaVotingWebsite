import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

// Node 24: node --experimental-transform-types scripts/verify-deletion.mjs
// prepare|verify <program-address> <public-report-path>
const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const codec = await import("../../apps/web/src/lib/polls-codec.ts");
const [phase, address, reportPath] = process.argv.slice(2);
assert.ok(
  ["prepare", "verify"].includes(phase) && address && reportPath,
  "Usage: prepare|verify <program-address> <public-report-path>",
);
const program = new PublicKey(address);
const rpc = new Connection("https://api.devnet.solana.com", "confirmed");
assert.equal(await rpc.getGenesisHash(), "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
assert.equal((await rpc.getAccountInfo(program))?.executable, true);
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config/solana/id.json"), "utf8"))),
);
const report = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, "utf8"))
  : {
      program: address,
      checks: [],
      signatures: [],
    };
assert.equal(report.program, address);
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
function pass(label) {
  report.checks.push(label);
  save();
  console.log(`PASS ${label}`);
}
async function send(instruction) {
  const tx = new Transaction().add(instruction);
  tx.feePayer = payer.publicKey;
  const signature = await sendAndConfirmTransaction(rpc, tx, [payer], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  report.signatures.push(signature);
  save();
  return signature;
}
function creatorInstruction(poll, data, actor = payer.publicKey) {
  return new TransactionInstruction({
    programId: program,
    data,
    keys: [
      { pubkey: new PublicKey(poll), isSigner: false, isWritable: true },
      { pubkey: actor, isSigner: true, isWritable: false },
    ],
  });
}
function voteInstruction(poll, actor) {
  const key = new PublicKey(poll);
  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: key, isSigner: false, isWritable: true },
      { pubkey: codec.receiptAddress(program, key, actor), isSigner: false, isWritable: true },
      { pubkey: actor, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([codec.CAST_VOTE, Buffer.from([0])]),
  });
}
async function read(poll) {
  const account = await rpc.getAccountInfo(new PublicKey(poll));
  assert.ok(account?.owner.equals(program));
  assert.equal(account.data.length, 898, "Poll allocation must remain compatible");
  return { account, poll: codec.decodePoll(poll, account.data) };
}
async function create(maximum = false) {
  const nonce = randomBytes(16);
  const poll = codec.pollAddress(program, payer.publicKey, nonce);
  await send(
    new TransactionInstruction({
      programId: program,
      keys: [
        { pubkey: poll, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: codec.encodeCreatePoll(
        {
          title: maximum
            ? "Deletion verification: legacy maximum".padEnd(100, ".")
            : "Deletion verification: test poll",
          description: maximum ? "x".repeat(280) : "Automated Devnet deletion verification.",
          options: maximum
            ? Array.from({ length: 6 }, (_, i) => `${i}${"x".repeat(59)}`)
            : ["Yes", "No"],
          closesAt: Math.floor(Date.now() / 1000) + 3600,
        },
        nonce,
      ),
    }),
  );
  await read(poll.toBase58());
  return poll.toBase58();
}
async function reject(label, instruction, actor, expected) {
  const tx = new Transaction({
    feePayer: payer.publicKey,
    ...(await rpc.getLatestBlockhash()),
  }).add(instruction);
  const signers = actor ? [payer, actor] : [payer];
  const { value } = await rpc.simulateTransaction(tx, signers);
  assert.ok(value.err, `${label} unexpectedly succeeded`);
  assert.match((value.logs ?? []).join("\n"), expected);
  pass(label);
}
async function preserveOriginalAccounts() {
  for (const entry of report.originalAccounts) {
    const account = await rpc.getAccountInfo(new PublicKey(entry.address));
    assert.equal(
      account?.data.toString("base64"),
      entry.data,
      `Existing account changed: ${entry.address}`,
    );
    assert.equal(account.lamports, entry.lamports);
  }
  pass("All original poll and receipt accounts remain byte-for-byte unchanged");
}

if (phase === "prepare") {
  assert.ok(
    !report.legacyMaximum && !report.legacyClosed,
    "Preparation already ran; reuse this report for verification",
  );
  report.originalAccounts = (await rpc.getProgramAccounts(program)).map(({ pubkey, account }) => ({
    address: pubkey.toBase58(),
    data: account.data.toString("base64"),
    lamports: account.lamports,
  }));
  save();
  report.legacyMaximum = await create(true);
  save();
  report.legacyClosed = await create();
  save();
  await send(creatorInstruction(report.legacyClosed, codec.CLOSE_POLL));
  assert.equal((await read(report.legacyClosed)).poll.closed, true);
  pass("Created a full-size legacy poll and a closed legacy poll before the upgrade");
} else {
  assert.ok(
    report.legacyMaximum && report.legacyClosed,
    "Run preparation against the old program first",
  );
  await preserveOriginalAccounts();
  const stranger = Keypair.generate();
  await send(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: stranger.publicKey,
      lamports: 20_000_000,
    }),
  );
  try {
    for (const key of [report.legacyMaximum, report.legacyClosed]) {
      const before = await read(key);
      await reject(
        "Other wallets cannot delete a legacy poll",
        creatorInstruction(key, codec.DELETE_POLL, stranger.publicKey),
        stranger,
        /ConstraintHasOne/,
      );
      await send(creatorInstruction(key, codec.DELETE_POLL));
      const after = await read(key);
      assert.equal(after.poll.deleted, true);
      assert.equal(after.poll.closed, true);
      assert.equal(codec.pollIsOpen(after.poll), false);
      assert.deepEqual(after.poll.votes, before.poll.votes);
      assert.equal(after.account.data[72], 2);
      pass("Creator deleted a legacy poll without account growth or lost results");
      await send(creatorInstruction(key, codec.CLOSE_POLL));
      assert.equal((await read(key)).poll.deleted, true);
      await reject(
        "Deleted polls reject new votes",
        voteInstruction(key, payer.publicKey),
        null,
        /PollClosed/,
      );
    }
    report.newPoll = await create();
    save();
    await send(voteInstruction(report.newPoll, payer.publicKey));
    const receiptKey = codec.receiptAddress(
      program,
      new PublicKey(report.newPoll),
      payer.publicKey,
    );
    const receipt = (await rpc.getAccountInfo(receiptKey)).data;
    const before = await read(report.newPoll);
    await send(creatorInstruction(report.newPoll, codec.DELETE_POLL));
    const after = await read(report.newPoll);
    assert.equal(after.poll.deleted, true);
    assert.deepEqual(after.poll.votes, before.poll.votes);
    assert.ok((await rpc.getAccountInfo(receiptKey)).data.equals(receipt));
    await reject(
      "Deleted new polls reject votes from another wallet",
      voteInstruction(report.newPoll, stranger.publicKey),
      stranger,
      /PollClosed/,
    );
    pass("A newly created poll can be voted on and deleted while preserving its vote receipt");
    await preserveOriginalAccounts();
  } finally {
    const balance = await rpc.getBalance(stranger.publicKey);
    if (balance > 0) {
      const refund = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: stranger.publicKey,
          toPubkey: payer.publicKey,
          lamports: balance,
        }),
      );
      refund.feePayer = payer.publicKey;
      report.signatures.push(
        await sendAndConfirmTransaction(rpc, refund, [payer, stranger], {
          commitment: "confirmed",
          preflightCommitment: "confirmed",
        }),
      );
      save();
    }
  }
}
console.log(`Report: ${reportPath}`);
