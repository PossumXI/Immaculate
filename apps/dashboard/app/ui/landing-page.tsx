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
    label: "Arobi Live Ledger Receipt",
    body: "The receipt now keeps both truths at once. The last verified supervised public rerun moved the ledger from 396 to 397 on Apr 20, and the same page also shows when the current public aura-genesis telemetry edge is synthesized/offline instead of pretending the old green state is still live."
  },
  {
    label: "Terminal-Bench Public Task",
    body: "The latest real Harbor run on the official public task is green on the default Q-only path: 5 trials, mean reward 1.0, zero errors, and pass@2, pass@4, and pass@5 all at 1.0."
  },
  {
    label: "Q Mediation Drift",
    body: "The four-scenario mixed-pressure reasoning lane is green on the active bench-v23 lock. Q and Immaculate both self-evaluate every scenario, route alignment stays perfect, and runner-path P95 is 4.4 ms."
  },
  {
    label: "Arobi Audit Integrity",
    body: "The live insurer-grade audit lane is green. Three governed scenarios kept the ledger chain intact with linked-records P50 5, source-coverage P50 4, self-evaluations P50 3, and audit-completeness P50 1.00."
  },
  {
    label: "Roundtable Runtime",
    body: "Immaculate now turns a cross-project objective into isolated agent lanes and proves the plan survives a live bounded loop from a cold start. The runtime benchmark keeps the everyday local Q lane on 11434, self-starts an isolated roundtable lane on 11435, covers Immaculate, OpenJaws, and Asgard, and stays green with 3 governed execution bundles, 3 repo audit receipts, 3 bounded execution receipts, 3 task documents, branch-authority held across every lane, a verified per-run decision-trace ledger, and 0 failed assertions."
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
    label: "Arobi Decision Review",
    body: "The live Arobi review page now summarizes the governed ledger itself: 2 linked ledgers, 9 linked records, 8 successful linked records, and the latest successful decision chain for the current Q-only harness inside the Arobi Network audit substrate."
  },
  {
    label: "Training State",
    body: "Q is the public model name built by Arobi Technology Alliance on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer. In the operating model, Arobi Network is the ledger and audit substrate, Immaculate is the harness and orchestrator, and Q is the brain on the active bench-v23 lock."
  },
  {
    label: "W&B Publication Surface",
    body: "The newest published W&B export is April 20. The current mediation, substrate, public-task, and audit-integrity wins are aligned across repo, wiki, and site, while the separate 60m soak page remains historical evidence from the last hour-class rerun."
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
          <p className="landingEyebrow">INTELLIGENT ORCHESTRATION | VERIFIED APRIL 20 | AROBI RECEIPT CURRENT | W&amp;B EXPORT APR 20</p>
          <h1 className="landingHeadline">Controlled intelligence for critical operations.</h1>
          <p className="landingLede">Arobi Network is the operator ledger and audit substrate. Immaculate is the harness and orchestrator. Q is the brain. Defense and healthcare. Evidence before action.</p>

          <div className="landingPills">
            <span>Q 4/4 structured</span>
            <span>BridgeBench 4/4</span>
            <span>Terminal-Bench public task 5/5</span>
            <span>Mean reward 1.0</span>
            <span>Mediation drift 4 scenarios</span>
            <span>Runner path P95 4.4ms</span>
            <span>Gateway P95 15.30s</span>
            <span>Substrate seam green</span>
            <span>Gateway contract green</span>
            <span>Identity gate green</span>
            <span>Arobi decision review live</span>
            <span>Arobi audit integrity 3 scenarios</span>
            <span>Arobi receipt current</span>
            <span>Last public rerun Apr 20</span>
            <span>Public edge truth surfaced</span>
            <span>Roundtable runtime 3 scenarios</span>
            <span>Roundtable cold-start green</span>
            <span>Roundtable probes 3 repo lanes</span>
            <span>Execution bundles P50 3</span>
            <span>Task docs P50 3</span>
            <span>Agent-branch authority P50 3</span>
            <span>Audit completeness P50 1.00</span>
            <span>Arobi Network audit substrate</span>
            <span>2 linked ledgers</span>
            <span>8 successful linked records</span>
            <span>Linked records P50 5</span>
            <span>Audit receipts P50 3</span>
            <span>Latest W&B export Apr 20</span>
            <span>Machine-stamped bench-v23 lock</span>
            <span>58 benchmark rows</span>
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
