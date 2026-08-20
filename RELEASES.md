# Releases and rollback

`main` is the deployment branch. Stable releases are tags named `vMAJOR.MINOR.PATCH` and must match the value in `VERSION`.

## Publish a release

1. Update `VERSION`, `js/version.js`, `sw.js` et la section correspondante de `RELEASES.md`.
2. Merge the tested changes into `main`.
3. Create and push an annotated tag, for example `git tag -a v1.9.0 -m "MeteoCompare 1.9.0" && git push origin v1.9.0`.
4. `.github/workflows/release.yml` reruns every regression test, creates a versioned ZIP and SHA-256 file, calls GitHub's generated-release-notes API to produce `CHANGELOG-vX.Y.Z.md`, uploads the build as a workflow artifact, and publishes a GitHub Release using that generated changelog.

## Roll back production

Run **Actions → Roll back GitHub Pages → Run workflow**, enter a known stable tag such as `v1.9.0`, and the workflow checks out that exact tag, reruns its tests and redeploys its static files. No history rewriting is required.

GitHub Releases are tag-based deployable iterations and generated release notes can include merged pull requests, contributors and a changelog link. Workflow artifacts remain useful for CI output but the GitHub Release is the durable versioned distribution point.

## Durcir les releases

Pour un dépôt public de production, activer les **immutable releases** dans GitHub empêche la modification du tag et des assets après publication. C'est recommandé une fois le workflow validé.

Après un rollback, éviter de pousser immédiatement une nouvelle version non corrigée sur `main`, car le workflow Pages continu redéploierait alors `main`. Le correctif normal est : rollback du tag stable → correction sur branche → tests → nouvelle release patch.
