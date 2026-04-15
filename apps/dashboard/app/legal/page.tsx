import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal",
  description: "Legal and business registration information for the Immaculate website and service surfaces."
};

export default function LegalPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <p className="legalEyebrow">Immaculate</p>
        <h1 className="legalTitle">Legal</h1>
        <div className="legalSectionGrid">
          <section className="legalCard">
            <h2>Business Representation</h2>
            <p>Arobi Technology Alliance A Opal Mar Group Corporation Company. All rights reserved.</p>
          </section>

          <section className="legalCard">
            <h2>Registration</h2>
            <p>Business registration record is represented in ZIP code 07419, New Jersey, USA.</p>
          </section>

          <section className="legalCard">
            <h2>Jurisdiction</h2>
            <p>New Jersey, USA courts and laws govern commercial use, service use, and dispute venue.</p>
          </section>

          <section className="legalCard">
            <h2>Refund Position</h2>
            <p>No refunds for any reason, regardless of product form, service form, delivery path, or advertising form.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
