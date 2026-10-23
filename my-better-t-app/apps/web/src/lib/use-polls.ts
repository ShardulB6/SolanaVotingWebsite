import { useCallback, useEffect, useState } from "react";
import { fetchPoll, fetchPolls, fetchReceipt, votingError } from "./polls";

// Read database state on every refresh, including after mobile reconnections.
function useLiveData<T>(read: () => Promise<T>, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setData(null);
    setError("");
    setUpdatedAt(null);
  }, [enabled, read]);
  useEffect(() => {
    setLoading(enabled);
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await read();
        if (active) {
          setData(result);
          setError("");
          setUpdatedAt(Date.now());
        }
      } catch (cause) {
        if (active) setError(votingError(cause));
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(refresh, 5000);
        }
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, revision, read]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { data, error, loading, updatedAt, refresh };
}

export function usePolls() {
  return useLiveData(fetchPolls, true);
}

export function usePoll(address: string) {
  const read = useCallback(() => fetchPoll(address), [address]);
  return useLiveData(read, true);
}

export function useReceipt(poll: string, voter?: string) {
  const read = useCallback(() => fetchReceipt(poll, voter!), [poll, voter]);
  return useLiveData(read, !!voter);
}
