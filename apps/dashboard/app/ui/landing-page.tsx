import Image from "next/image";
import { LandingScene } from "./landing-scene";
import { arobiUrl } from "../site";

const ribbonWords = Array.from({ length: 10 }, () => "INTELLIGENT ORCHESTRATION");

const sectors = [
  {
    label: "Defense",
    body: "Mission control under pressure."
  },
  {
    label: "Healthcare",
    body: "Human-safe decisions in motion."
  }
];

const proofCards = [
  {
    label: "BridgeBench",
    body: "3 of 4 parsed clean. 1 timeout surfaced."
  },
  {
    label: "TerminalBench",
    body: "Harbor task lane held 1.000 and 1.000."
  },
  {
    label: "30m Soak",
    body: "1270.54 events per second. 2 integrity flags."
  },
  {
    label: "Training",
    body: "bench-v3 lock. 1069 rows. Q plus Immaculate."
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
          <p className="landingEyebrow">INTELLIGENT ORCHESTRATION | VERIFIED APRIL 15</p>
          <h1 className="landingHeadline">Controlled intelligence for critical operations.</h1>
          <p className="landingLede">Defense and healthcare. Evidence before action. Q only. Benchmarked. Locked.</p>

          <div className="landingPills">
            <span>Q only</span>
            <span>bench-v3 locked</span>
            <span>Harbor 1.000 / 1.000</span>
            <span>30m soak 1270.54/s</span>
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
            <div className="landingVisualTag landingVisualTagTop">Defense + Healthcare</div>
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
