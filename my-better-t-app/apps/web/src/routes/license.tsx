import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import licenseText from "../../../../../LICENSE?raw";

export const Route = createFileRoute("/license")({
  head: () => ({ meta: [{ title: "MIT License · Hack Day Voting" }] }),
  component: LicensePage,
});

function LicensePage() {
  return (
    <main className="min-h-svh bg-[#f7f7f5] px-5 py-10 md:p-10">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
        <article
          aria-label="MIT License"
          className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm md:p-10"
        >
          <h1 className="mb-6 text-2xl font-semibold tracking-tight text-stone-900">
            Project license
          </h1>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-stone-600">
            {licenseText}
          </pre>
        </article>
      </div>
    </main>
  );
}
