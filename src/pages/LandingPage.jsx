export default function LandingPage({ onFindPt, onListServices }) {
  return (
    <div className="landing">
      <p className="landing-eyebrow">UK personal trainer directory</p>
      <h1>
        Find the right trainer.<br />
        <em>Not just the nearest one.</em>
      </h1>
      <p className="landing-sub">
        Tell us what you're looking for and we'll match you with verified specialist
        trainers in your area — no browsing, no guesswork.
      </p>
      <div className="landing-actions">
        <button className="landing-btn-primary" onClick={onFindPt}>
          Find a PT
        </button>
        <button className="landing-btn-ghost" onClick={onListServices}>
          List your services
        </button>
      </div>
    </div>
  );
}
