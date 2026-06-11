import LegalPageLayout from './LegalPageLayout';

const TermsOfServicePage = () => (
  <LegalPageLayout
    title="Terms of Service"
    description="Terms and conditions governing your use of the FlowTrack platform, desktop apps, and related services."
    canonicalPath="/terms"
    lastUpdated="June 11, 2026"
  >
    <section>
      <h2 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
      <p className="text-sm text-slate-400">
        By accessing or using FlowTrack, you agree to these Terms of Service. If you are using FlowTrack on behalf of
        an organization, you represent that you have authority to bind that organization to these terms.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">2. Service Description</h2>
      <p className="text-sm text-slate-400">
        FlowTrack provides software for time tracking, workforce activity monitoring, screenshot capture, analytics,
        team management, and billing. Features may vary by subscription plan and may be updated over time.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">3. Account Responsibilities</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm text-slate-400">
        <li>You must provide accurate registration information and keep credentials secure.</li>
        <li>You are responsible for all activity under your account.</li>
        <li>Administrators are responsible for configuring monitoring features in compliance with applicable laws.</li>
        <li>You must not misuse the service, attempt unauthorized access, or interfere with platform operations.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">4. Acceptable Use</h2>
      <p className="text-sm text-slate-400 mb-3">You agree not to use FlowTrack to:</p>
      <ul className="list-disc pl-5 space-y-2 text-sm text-slate-400">
        <li>Violate privacy, labor, or employment laws in your jurisdiction.</li>
        <li>Upload malicious code, spam, or unlawful content.</li>
        <li>Reverse engineer, scrape, or resell the service without written permission.</li>
        <li>Harass, exploit, or harm other users or third parties.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">5. Subscriptions &amp; Payments</h2>
      <p className="text-sm text-slate-400">
        Paid plans renew according to the billing cycle selected at purchase unless cancelled. Fees are non-refundable
        except where required by law. We may change pricing with reasonable notice for future billing periods.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">6. Intellectual Property</h2>
      <p className="text-sm text-slate-400">
        FlowTrack, including its software, branding, and documentation, is owned by us or our licensors. You receive
        a limited, non-exclusive license to use the service according to your plan. You retain ownership of your
        organization&apos;s work data uploaded to the platform.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">7. Disclaimer &amp; Limitation of Liability</h2>
      <p className="text-sm text-slate-400">
        FlowTrack is provided &quot;as is&quot; to the fullest extent permitted by law. We do not guarantee uninterrupted
        service. Our total liability for any claim arising from the service is limited to the amount paid by you to
        FlowTrack in the twelve (12) months preceding the claim.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">8. Termination</h2>
      <p className="text-sm text-slate-400">
        You may stop using FlowTrack at any time. We may suspend or terminate access for violations of these terms,
        security risks, or non-payment. Upon termination, your right to use the service ends, subject to applicable
        data retention policies.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">9. Changes to Terms</h2>
      <p className="text-sm text-slate-400">
        We may update these Terms from time to time. Material changes will be communicated through the product or by
        email. Continued use after changes become effective constitutes acceptance of the revised Terms.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">10. Contact</h2>
      <p className="text-sm text-slate-400">
        Questions about these Terms? Contact{' '}
        <a href="mailto:support@flowtrack.app" className="text-primary-400 hover:text-primary-300">support@flowtrack.app</a>.
      </p>
    </section>
  </LegalPageLayout>
);

export default TermsOfServicePage;
