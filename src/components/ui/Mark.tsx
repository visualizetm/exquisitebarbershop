/**
 * A brand mark that follows the theme without JavaScript: the black file shows
 * in light and the white one in dark (base.css hides the other one).
 */
export function Mark({
  name,
  alt = '',
  className = '',
  width,
  height,
}: {
  name:
    | 'primary'
    | 'wordmark'
    | 'stacked'
    | 'q-icon'
    | 'seal'
    | 'crest'
    | 'disc'
    | 'arched'
    | 'lockup-vertical';
  alt?: string;
  className?: string;
  width: number;
  height: number;
}) {
  return (
    <>
      <img
        className={`exq-mark exq-mark--light ${className}`.trim()}
        src={`/brand/exq-${name}-black.svg`}
        alt={alt}
        width={width}
        height={height}
      />
      <img
        className={`exq-mark exq-mark--dark ${className}`.trim()}
        src={`/brand/exq-${name}-white.svg`}
        alt={alt}
        width={width}
        height={height}
      />
    </>
  );
}
