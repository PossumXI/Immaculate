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
    label: "Terminal-Bench Public Task",
    body: "The latest real Harbor run on the official public task is green on the default Q-only path: 5 trials, mean reward 1.0, zero errors, and pass@2, pass@4, and pass@5 all at 1.0."
  },
  {
    label: "Q Mediation Drift",
    body: "The four-scenario mixed-pressure reasoning lane is green on the active bench-v23 lock. Q and Immaculate both self-evaluate every scenario, route alignment stays perfect, and runner-path P95 is 6.68 ms."
  },
  {
    label: "Q Substrate Benchmark",
    body: "Gateway to Immaculate seam is green. Structured handoff survives arbitration with zero failed assertions, gateway P95 is 15.30s, and arbitration P95 is 1.74 ms."
  },
  {
    label: "Q Gateway Contract",
    body: "The dedicated Q gateway is live and bounded: health 200, auth 401 without a key, Q-only model listing, chat 200 with a key, and concurrent pressure rejects at 429."
  },
  {
    label: "Arobi Audit Trail",
    body: "The live Q API audit loop now records successful governed calls into a chained Arobi decision ledger. The latest authenticated /api/q/run call completed with parse success, a linked decision trace, and a truthful ROUTE/REASON/COMMIT record."
  },
  {
    label: "Training State",
    body: "Q is the public model name built by Arobi Technology Alliance on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer, and Immaculate is the governed orchestration harness around Q on the active bench-v23 lock."
  },
  {
    label: "W&B Publication Surface",
    body: "The newest published W&B export is April 18. The newer April 19 mediation, substrate, and audit-trail wins are live repo evidence now, while the separate 60m soak page remains historical evidence from the last hour-class rerun."
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
          <p className="landingEyebrow">INTELLIGENT ORCHESTRATION | VERIFIED APRIL 19 | W&amp;B EXPORT APR 18</p>
          <h1 className="landingHeadline">Controlled intelligence for critical operations.</h1>
          <p className="landingLede">Defense and healthcare. Evidence before action. Q only. Benchmarked. Gateway seam proven. Arobi audit loop live.</p>

          <div className="landingPills">
            <span>Q 4/4 structured</span>
            <span>BridgeBench 4/4</span>
            <span>Terminal-Bench public task 5/5</span>
            <span>Mean reward 1.0</span>
            <span>Mediation drift 4 scenarios</span>
            <span>Runner path P95 6.68ms</span>
            <span>Gateway P95 15.30s</span>
            <span>Substrate seam green</span>
            <span>Gateway contract green</span>
            <span>Identity gate green</span>
            <span>Arobi decision trace live</span>
            <span>Latest W&B export Apr 18</span>
            <span>Machine-stamped bench-v23 lock</span>
            <span>55 benchmark rows</span>
            <span>117 training rows</span>
            <span>HF Jobs launch ready</span>
            <span>Kaggle export ready</span>
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
