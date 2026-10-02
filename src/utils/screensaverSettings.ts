export const DEFAULT_SCREENSAVER_TIMEOUT_SECONDS = 60;

/**
 * Leaves an existing user preference untouched, while giving new installs and
 * invalid legacy values the documented one-minute default.
 */
export function getScreensaverTimeout(): number {
  const storedValue = localStorage.getItem('screensaver_timeout');
  if (storedValue === null) return DEFAULT_SCREENSAVER_TIMEOUT_SECONDS;

  const timeout = Number.parseInt(storedValue, 10);
  return Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_SCREENSAVER_TIMEOUT_SECONDS;
}
