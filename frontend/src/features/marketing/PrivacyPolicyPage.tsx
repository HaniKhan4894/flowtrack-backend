import LegalPageLayout from './LegalPageLayout';

const PrivacyPolicyPage = () => (
  <LegalPageLayout
    title="Privacy Policy"
    description="How FlowTrack collects, uses, stores, and protects your personal and team data."
    canonicalPath="/privacy"
    lastUpdated="June 11, 2026"
  >
    <section>
      <h2 className="text-xl font-bold text-white mb-3">1. Introduction</h2>
      <p className="text-sm text-slate-400">
        FlowTrack (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides team time tracking, activity monitoring,
        screenshot capture, analytics, and billing software. This Privacy Policy explains what information we collect,
        why we collect it, and how you can control your data when using our web app, desktop app, and related services.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">2. Information We Collect</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm text-slate-400">
        <li><strong className="text-slate-200">Account data:</strong> name, email address, password (hashed), organization details, and role.</li>
        <li><strong className="text-slate-200">Work activity data:</strong> time entries, project assignments, timer events, and optional screenshot captures configured by your organization.</li>
        <li><strong className="text-slate-200">Device and usage data:</strong> browser type, operating system, app version, IP address, and diagnostic logs for security and performance.</li>
        <li><strong className="text-slate-200">Billing data:</strong> subscription plan, invoice details, and payment references processed through third-party payment providers.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">3. How We Use Your Information</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm text-slate-400">
        <li>Provide and maintain the FlowTrack platform and desktop applications.</li>
        <li>Generate time reports, analytics, screenshots timelines, and invoices for authorized users.</li>
        <li>Authenticate users, prevent fraud, and protect account security.</li>
        <li>Send service notifications, product updates, and support responses.</li>
        <li>Improve product performance, reliability, and user experience.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">4. Screenshot &amp; Activity Monitoring</h2>
      <p className="text-sm text-slate-400">
        Screenshot and activity features are controlled by organization administrators. FlowTrack processes this data
        only to deliver the service requested by your team. We recommend employers inform team members about monitoring
        policies in accordance with applicable local laws.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">5. Data Sharing</h2>
      <p className="text-sm text-slate-400 mb-3">
        We do not sell your personal data. We may share information only with:
      </p>
      <ul className="list-disc pl-5 space-y-2 text-sm text-slate-400">
        <li>Trusted infrastructure and hosting providers that help us operate the service.</li>
        <li>Payment processors for subscription and billing transactions.</li>
        <li>Legal authorities when required by law or to protect rights, safety, and security.</li>
      </ul>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">6. Data Retention &amp; Security</h2>
      <p className="text-sm text-slate-400">
        We retain account and activity data for as long as your organization uses FlowTrack, unless deletion is
        requested or required by law. We apply encryption in transit, access controls, and industry-standard security
        practices to protect your information.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">7. Your Rights</h2>
      <p className="text-sm text-slate-400">
        Depending on your location, you may have rights to access, correct, export, or delete your personal data.
        Contact us at <a href="mailto:support@flowtrack.app" className="text-primary-400 hover:text-primary-300">support@flowtrack.app</a> to
        submit a privacy request.
      </p>
    </section>

    <section>
      <h2 className="text-xl font-bold text-white mb-3">8. Contact</h2>
      <p className="text-sm text-slate-400">
        For privacy questions or concerns, email{' '}
        <a href="mailto:support@flowtrack.app" className="text-primary-400 hover:text-primary-300">support@flowtrack.app</a>.
      </p>
    </section>
  </LegalPageLayout>
);

export default PrivacyPolicyPage;
