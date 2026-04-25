import Image from "next/image";
import { LandingScene } from "./landing-scene";
import { arobiUrl } from "../site";

const ribbonWords = Array.from({ length: 10 }, () => "INTELLIGENT ORCHESTRATION");

const sectors = [
  {
    label: "AI teams",
    body: "Give agents a command center."
  },
  {
    label: "Operators",
    body: "Approve actions before they matter."
  }
];

const proofCards = [
  {
    label: "Operator Command Center",
    body: "Run agent work from one place, see what happened, and keep a clean record for review."
  },
  {
    label: "Q Private Gateway",
    body: "Use Q through a bounded API with keys, limits, model checks, and release evidence attached."
  },
  {
    label: "Audit Trails",
    body: "Every important request, decision, and result can be traced after the work is done."
  },
  {
    label: "Benchmarked Results",
    body: "Terminal-Bench, BridgeBench, W&B, and release reports turn claims into repeatable proof."
  },
  {
    label: "Human In The Loop",
    body: "Keep people in charge of risky actions while routine work stays fast."
  },
  {
    label: "Multi-Agent Workflows",
    body: "Coordinate research, coding, reviews, and benchmarks across isolated agent work lanes."
  },
  {
    label: "Private By Default",
    body: "Public pages show safe summaries while private missions, paths, prompts, and raw logs stay protected."
  },
  {
    label: "Ready For Pilots",
    body: "Start with a private Q gateway pilot, then expand into the full operator harness as evidence grows."
  }
];

export function LandingPage() {
  return (
    <main className="landing">
      <div className="landingAura landingAuraOne" />
      <div className="landingAura landingAuraTwo" />
      <div className="landingGridShell" />

      <header className="landingTopbar">
        <div className="landingBrand">
          <Image
            src="/assets/immaculate-mark.svg"
            alt="Immaculate mark"
            width={46}
            height={46}
            priority
            className="landingBrandMark"
          />
          <div className="landingBrandText">
            <span className="landingBrandName">Immaculate</span>
            <span className="landingBrandSubline">Intelligent orchestration</span>
          </div>
        </div>

        <a
          className="landingCta"
          href={arobiUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn About Arobi
        </a>
      </header>

      <section className="landingHero">
        <div className="landingCopy">
          <p className="landingEyebrow">AI OPERATORS | AUDIT TRAILS | HUMAN OVERSIGHT</p>
          <h1 className="landingHeadline">Run AI agents you can trust, review, and control.</h1>
          <p className="landingLede">Immaculate gives Q and your agent teams a governed workspace for research, coding, benchmarks, approvals, and audit-ready records.</p>

          <div className="landingPills">
            <span>Q gateway</span>
            <span>Agent work lanes</span>
            <span>Audit receipts</span>
            <span>Human approvals</span>
            <span>Benchmark reports</span>
            <span>Private pilots</span>
            <span>Public-safe summaries</span>
            <span>OpenJaws-ready architecture</span>
          </div>

          <div className="landingSectorGrid">
            {sectors.map((sector) => (
              <article key={sector.label} className="landingSectorCard">
                <p className="landingSectorLabel">{sector.label}</p>
                <p className="landingSectorBody">{sector.body}</p>
              </article>
            ))}
          </div>

          <div className="landingEvidenceGrid">
            {proofCards.map((card) => (
              <article key={card.label} className="landingEvidenceCard">
                <p className="landingEvidenceLabel">{card.label}</p>
                <p className="landingEvidenceBody">{card.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="landingVisual">
          <div className="landingVisualFrame">
            <Image
              src="/assets/immaculate-grid.svg"
              alt="Immaculate tactical frame"
              width={1400}
              height={1400}
              priority
              className="landingFrameAsset landingFrameAssetGrid"
            />
            <Image
              src="/assets/immaculate-constellation.svg"
              alt="Immaculate signal constellation"
              width={1200}
              height={1200}
              priority
              className="landingFrameAsset landingFrameAssetConstellation"
            />
            <div className="landingSceneShell">
              <LandingScene />
            </div>
            <div className="landingVisualTag landingVisualTagTop">Governed AI Operations</div>
            <div className="landingVisualTag landingVisualTagBottom">INTELLIGENT ORCHESTRATION</div>
          </div>
        </div>
      </section>

      <section className="landingRibbon" aria-label="Intelligent orchestration ribbon">
        <div className="landingRibbonTrack">
          {ribbonWords.map((word, index) => (
            <span key={`${word}-${index}`}>{word}</span>
          ))}
        </div>
      </section>

      <footer className="landingFooter">
        <div className="landingFooterMeta">
          <p className="landingFooterCopy">
            Arobi Technology Alliance A Opal Mar Group Corporation Company. All rights reserved.
          </p>
          <div className="landingFooterLinks">
            <a href="/terms">Terms of Use</a>
            <a href="/legal">Legal</a>
          </div>
        </div>
        <a
          className="landingCta landingCtaFooter"
          href={arobiUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn About Arobi
        </a>
      </footer>
    </main>
  );
}
