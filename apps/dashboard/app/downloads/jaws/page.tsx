import type { Metadata } from "next";
import { siteUrl } from "../../site";

const openJawsGithubUrl = "https://github.com/PossumXI/OpenJaws";

const release = {
  version: "0.1.6",
  tag: "jaws-v0.1.6",
  publishedAt: "May 1, 2026",
  releaseUrl: "https://github.com/PossumXI/OpenJaws/releases/tag/jaws-v0.1.6"
};

const packages = [
  {
    label: "Windows installer",
    file: "JAWS_0.1.6_x64-setup.exe",
    size: "34.59 MB",
    href: "/downloads/jaws/windows",
    digest: "f2dfe1e3aebd981c7e07c2a8aa7dbc78ac590eed61c0ab1076e469ed115c3fbd"
  },
  {
    label: "Windows MSI",
    file: "JAWS_0.1.6_x64_en-US.msi",
    size: "51.40 MB",
    href: "/downloads/jaws/windows-msi",
    digest: "bab5ce0e28e86ea9c510a534acf530d979233eb6b038ecd0df9a49c67056513f"
  },
  {
    label: "macOS Intel",
    file: "JAWS_0.1.6_x64.dmg",
    size: "35.87 MB",
    href: "/downloads/jaws/macos",
    digest: "f2f65cb2283d3c567e7fb145c9cb76544f331887c744dc57de8c4f8dba545b6d"
  },
  {
    label: "Linux DEB",
    file: "JAWS_0.1.6_amd64.deb",
    size: "51.36 MB",
    href: "/downloads/jaws/linux-deb",
    digest: "ced9f5c088185eadf68f6328bc39b969dc2c85ce9ae21547ef301a7ec9a69ae6"
  },
  {
    label: "Linux RPM",
    file: "JAWS-0.1.6-1.x86_64.rpm",
    size: "51.37 MB",
    href: "/downloads/jaws/linux-rpm",
    digest: "3e94256946b12364f976886fe3d103184764a08fad5afc196f59dbb8cbcd813b"
  }
];

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
