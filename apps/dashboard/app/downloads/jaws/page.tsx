import type { Metadata } from "next";
import { siteUrl } from "../../site";
import jawsRelease from "../../../../../jaws-release.json";

const openJawsGithubUrl = "https://github.com/PossumXI/OpenJaws";

const release = {
  version: jawsRelease.version,
  tag: jawsRelease.tag,
  publishedAt: jawsRelease.publishedAtLabel,
  releaseUrl: `https://github.com/${jawsRelease.githubRepo}/releases/tag/${jawsRelease.tag}`
};

const packages = jawsRelease.downloads
  .filter((download) => download.file !== "latest.json")
  .map((download) => ({
    label: download.label,
    file: download.file,
    size: download.size,
    href: download.path,
    digest: download.digest
  }));

export const metadata: Metadata = {
  title: `JAWS ${release.version} downloads | Immaculate`,
  description:
    "Download the signed JAWS desktop app for OpenJaws, Q, Immaculate, and agent workspace control.",
  alternates: {
    canonical: new URL("/downloads/jaws", siteUrl).toString()
  }
};

export default function JawsDownloadsPage() {
  return (
    <main className="legalPage">
      <section className="legalShell">
        <a className="landingCta" href="/">
          Back to Immaculate
        </a>
        <p className="legalEyebrow">JAWS IDE download mirror</p>
        <h1 className="legalTitle">JAWS {release.version}</h1>
        <p className="legalLead">
          JAWS wraps OpenJaws in a native desktop workspace for Q, Immaculate,
          project folders, agent progress, chat, TUI view, and signed updates.
          This iorch.net mirror points to the same public GitHub release assets
          as qline.site.
        </p>
        <div className="landingPills">
          <span>Signed release</span>
          <span>OpenJaws backend</span>
          <span>Q ready</span>
          <span>Immaculate orchestration</span>
          <span>Updater manifest</span>
        </div>
        <div className="landingSectorGrid">
          <article className="landingSectorCard">
            <p className="landingSectorLabel">Current release</p>
            <p className="landingSectorBody">{release.tag}</p>
          </article>
          <article className="landingSectorCard">
            <p className="landingSectorLabel">Published</p>
            <p className="landingSectorBody">{release.publishedAt}</p>
          </article>
        </div>
        <div className="landingFooterLinks">
          <a href="/downloads/jaws/windows">Download Windows</a>
          <a href="/downloads/jaws/latest.json">Updater manifest</a>
          <a href={release.releaseUrl}>GitHub release</a>
          <a href={openJawsGithubUrl}>OpenJaws repo</a>
        </div>
        <section className="legalSectionGrid" aria-label="JAWS release packages">
          {packages.map((pkg) => (
            <a className="legalCard" href={pkg.href} key={pkg.href}>
              <h2>{pkg.label}</h2>
              <p>{pkg.file}</p>
              <p>{pkg.size}</p>
              <p>sha256:{pkg.digest}</p>
            </a>
          ))}
        </section>
      </section>
    </main>
  );
}
