import { useEffect, useState } from 'react';

import { ApiError } from '@/shared/api/api-error';

import { mergeEdit } from './merge-edit';

export function isVersionConflict(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'VERSION_CONFLICT'
  );
}

export function useEditConflict<
  TRecord extends { version: number },
  TValues extends object,
>(
  initial: TRecord | undefined,
  readLatest: () => Promise<TRecord>,
  valuesOf: (record: TRecord) => TValues,
) {
  const [record, setRecord] = useState(initial);
  const [needsReview, setNeedsReview] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [fields, setFields] = useState<(keyof TValues)[]>([]);
  const [remote, setRemote] = useState<TValues>();
  // A refreshed snapshot may advance the version only when the edited fields
  // have not changed on the server. Local draft values remain untouched.
  useEffect(() => {
    if (
      initial &&
      record &&
      initial.version > record.version &&
      !needsReview &&
      !fields.length &&
      JSON.stringify(valuesOf(initial)) === JSON.stringify(valuesOf(record))
    )
      setRecord(initial);
  }, [initial, record, needsReview, fields.length, valuesOf]);
  function capture(failure: unknown) {
    if (isVersionConflict(failure)) {
      setNeedsReview(true);
      setReviewed(false);
      setFields([]);
      setError(undefined);
    }
  }
  async function review(local: TValues, apply: (values: TValues) => void) {
    if (!record || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const latest = await readLatest();
      const latestValues = valuesOf(latest);
      const result = mergeEdit(valuesOf(record), local, latestValues);
      apply(result.merged);
      setRecord(latest);
      setRemote(latestValues);
      setFields(result.conflicts);
      setNeedsReview(false);
      setReviewed(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  function resolve(key: keyof TValues) {
    setFields((current) => current.filter((field) => field !== key));
  }
  function accept(saved: TRecord) {
    setRecord(saved);
    setNeedsReview(false);
    setReviewed(false);
    setFields([]);
    setError(undefined);
  }
  return {
    record,
    needsReview,
    reviewed,
    pending,
    error,
    fields,
    remote,
    blocked: needsReview || pending || fields.length > 0,
    capture,
    review,
    resolve,
    accept,
  };
}
