// Overwritten by .github/workflows/release.yml with the real tag before the
// binaries are built. "dev" means "built locally", which disables self-update —
// a dev build must never be replaced by a release binary behind your back.
export const RELEASE_TAG = "dev";
