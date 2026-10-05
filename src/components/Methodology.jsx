/**
 * Methodology — a static reference page.
 *
 * Explains where the evidence behind the sky comes from and what its numbers
 * do and do not mean. Same dark theme and typography as the rest of the app;
 * no data fetching, no state.
 */

export default function Methodology() {
  return (
    <main className="methodology-screen">
      <article className="methodology">
        <header className="methodology__header">
          <p className="methodology__eyebrow">Methodology</p>
          <h1 className="methodology__title">Where this evidence comes from</h1>
          <p className="methodology__lede">
            Every star and trail in the sky is drawn from a real, public career
            dataset. Here is exactly what it measures — and what it doesn&rsquo;t.
          </p>
        </header>

        <section className="methodology__section">
          <h2 className="methodology__heading">Where the data comes from</h2>
          <p className="methodology__body">
            JobHop v2, published by Ghent University (IDLab/AIDA research group),
            built from career information in pseudonymized resumes provided by
            VDAB, the Flemish public employment service. Released publicly under a
            CC BY 4.0 license. It contains <strong>1,594,827</strong> career
            experience records from <strong>284,251</strong> unique individuals,
            with <strong>2,983</strong> distinct occupation codes observed.{' '}
            <strong>92.36%</strong> of records were successfully matched to a
            readable occupation title via the official ESCO classification.{' '}
            <strong>94.73%</strong> of people in the dataset have two or more career
            records, enabling sequential trajectory analysis. After removing
            overlapping/concurrent employment and applying person-level
            deduplication, <strong>853,920</strong> valid sequential transitions
            remain in the dataset.
          </p>
        </section>

        <section className="methodology__section">
          <h2 className="methodology__heading">
            What &ldquo;observed transition share&rdquo; actually means
          </h2>
          <p className="methodology__body">
            When a star shows 18%, that means: among people in this dataset who
            left the starting occupation, 18% of them moved into this specific
            next occupation. It is NOT a personal probability and it is not a
            prediction that you have an 18% chance of this happening to you. It
            describes what happened in a real historical population, not what
            will happen to any one individual.
          </p>
        </section>

        <section className="methodology__section">
          <h2 className="methodology__heading">How a transition is counted</h2>
          <p className="methodology__body">
            A transition only counts if the next role&rsquo;s start date falls on
            or after the previous role&rsquo;s end date — this excludes concurrent
            or overlapping employment, which is common in real resume data and
            would otherwise be misread as a career move. Statistics are calculated
            per person, not per row, so individuals with unusually long or messy
            job histories don&rsquo;t distort the results.
          </p>
        </section>

        <section className="methodology__section">
          <h2 className="methodology__heading">Honest limitations</h2>
          <p className="methodology__body">
            This dataset reflects the Flemish/Belgian labor market, not
            India&rsquo;s — we use it to demonstrate and validate the methodology,
            with Indian labor-market data as a clearly scoped next step.
            Skill-to-occupation mapping is curated for this version, not learned
            from a dedicated occupation-skill dataset. There is no
            compensation/salary layer in this version — JobHop does not include
            salary data.
          </p>
        </section>
      </article>
    </main>
  );
}
