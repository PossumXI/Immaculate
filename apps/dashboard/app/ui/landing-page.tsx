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
    label: "Q Mediation Drift",
    body: "The four-scenario mixed-pressure reasoning lane is green on the active bench-v18 lock. Q and Immaculate both self-evaluate every scenario, route alignment stays perfect, and runner-path P95 is 24.61 ms."
  },
  {
    label: "Q Substrate Benchmark",
    body: "Gateway to Immaculate seam is green. Structured handoff survives arbitration with zero failed assertions, gateway P95 is 28.01s, and arbitration P95 is 2.66 ms."
  },
  {
    label: "Q Gateway Contract",
    body: "The dedicated Q gateway is live and bounded: health 200, auth 401 without a key, Q-only model listing, chat 200 with a key, and concurrent pressure rejects at 429."
  },
  {
    label: "Harbor Operator Pack",
    body: "Q reached 0.950 and 0.925 on the governed operator pack."
  },
  {
    label: "Public Terminal-Bench",
    body: "The historical official public receipt is still 0.000. A separate local diagnostic rerun is 5/5, but it stays diagnostic-only. The latest default Q-only smoke now completes end to end with zero exceptions and a 0.0 score, so the remaining gap is solver depth rather than gateway failure."
  },
  {
    label: "Training State",
    body: "Q is the public model name built by Arobi Technology Alliance on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer, and Immaculate is the governed orchestration harness around Q."
  },
  {
    label: "Cloud Lanes",
    body: "HF Jobs auth, hardware visibility, and bundle staging are real on the active bench-v18 lock, and the staged cloud launch is ready. Cloudflare has the profile and eval bundle ready on bench-v18, but worker auth and adapter export are still blocked."
  },
  {
    label: "W&B Publication Surface",
    body: "The newest tracked W&B export is April 18. The April 18 mediation and substrate reruns are also live repo evidence, while the separate 60m soak page remains historical evidence from the last hour-class rerun."
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
          <p className="landingEyebrow">INTELLIGENT ORCHESTRATION | VERIFIED APRIL 18 | W&amp;B EXPORT APR 18</p>
          <h1 className="landingHeadline">Controlled intelligence for critical operations.</h1>
          <p className="landingLede">Defense and healthcare. Evidence before action. Q only. Benchmarked. Gateway seam proven. Audit loop live.</p>

          <div className="landingPills">
            <span>Q 4/4 structured</span>
            <span>BridgeBench 4/4</span>
            <span>Mediation drift 4 scenarios</span>
            <span>Runner path P95 24.61ms</span>
            <span>Substrate seam green</span>
            <span>Gateway contract green</span>
            <span>Identity gate green</span>
            <span>Harbor 0.950 / 0.925</span>
            <span>Latest W&B export Apr 18</span>
            <span>Machine-stamped bench-v18 lock</span>
            <span>55 benchmark rows</span>
            <span>6 failure seeds</span>
            <span>Public Terminal-Bench 0.000</span>
            <span>Diagnostic rerun 5/5</span>
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
