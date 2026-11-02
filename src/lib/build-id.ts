const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * The deploy identity stamped into every page as `<meta name="oc-build">`.
 *
 * Only Netlify's buildbot may claim a SHA. The Netlify CLI also sets COMMIT_REF
 * on local builds, from `git rev-parse HEAD` with no dirty check, alongside
 * NETLIFY_LOCAL=true, so a local build on a changed tree would otherwise claim a
 * commit it does not contain. "local" never equals a release candidate, so a
 * guard polling for identity fails closed.
 */
export function resolveBuildId(
  ref: string | undefined,
  netlifyLocal: string | undefined,
): string {
  if (netlifyLocal === undefined && ref !== undefined && FULL_SHA.test(ref)) {
    return ref;
  }
  return "local";
}
