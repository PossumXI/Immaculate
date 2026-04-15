import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of Use for the Immaculate website, product, and service surfaces."
};

const sections = [
  {
    title: "Use Of Service",
    body:
      "Immaculate and related Q surfaces are offered for evaluation, product access, service access, and related business engagement subject to these Terms of Use."
  },
  {
    title: "No Refunds",
    body:
      "All sales, service fees, subscriptions, pilot fees, access fees, delivery fees, and related charges are final. No refunds will be issued for any reason, regardless of how the product or service was delivered, accessed, described, marketed, advertised, staged, demonstrated, or provisioned."
  },
  {
    title: "Delivery And Access",
    body:
      "Product or service delivery may occur through software access, hosted service access, cloud deployment, private deployment, advisory delivery, pilot delivery, benchmark delivery, or other commercial delivery form. Finality of payment applies across all delivery forms."
  },
  {
    title: "Governing Law And Venue",
    body:
      "These terms are governed by the laws of the State of New Jersey, USA. Any dispute, claim, or proceeding relating to Immaculate, Q, or related services must be brought exclusively in the applicable state or federal courts of New Jersey, USA."
  }
];

export default function TermsPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <p className="legalEyebrow">Immaculate</p>
        <h1 className="legalTitle">Terms of Use</h1>
        <p className="legalLead">
          These terms govern use of the website, product, and service surfaces associated with Immaculate and Q.
        </p>

        <div className="legalSectionGrid">
          {sections.map((section) => (
            <section key={section.title} className="legalCard">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
