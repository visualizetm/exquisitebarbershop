/** One sentence under a form when a request failed. Empty when there is nothing to say. */
export function TeamError({ message }: { message: string | null }) {
  return message ? (
    <p className="exq-team-error" role="alert">
      {message}
    </p>
  ) : null;
}
