import privacyPolicyContent from '../legal/PRIVACY_POLICY.md?raw';
import termsOfServiceContent from '../legal/TERMS_OF_SERVICE.md?raw';
import MarkdownDoc from '../components/MarkdownDoc';

const DOCUMENTS = {
  privacy: { content: privacyPolicyContent },
  terms: { content: termsOfServiceContent },
};

export default function LegalPage({ document, onBack }) {
  const doc = DOCUMENTS[document] ?? DOCUMENTS.privacy;

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <button className="btn-ghost" style={{ marginBottom: 24 }} onClick={onBack}>
        ← Back
      </button>
      <div className="form-card" style={{ maxWidth: 760, textAlign: 'left' }}>
        <MarkdownDoc content={doc.content} />
      </div>
    </div>
  );
}
