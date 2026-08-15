// Overwritten by .github/workflows/release.yml with the version being published
// to npm. "dev" means "built locally", which disables self-update — a dev build
// must never be replaced by a published one behind your back.
// The annotation is load-bearing: without it the literal type would be 'dev'
// here and '1.2.3' in CI, so every `=== 'dev'` check compiles locally and
// fails the release build as a comparison with no overlap.
// oxlint-disable-next-line typescript/no-inferrable-types -- see above
export const RELEASE_VERSION: string = 'dev'
