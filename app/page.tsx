"use client";

import { useState } from "react";
import PoseVideo, { type AssessmentResult } from "./PoseVideo";
import KeyMomentReplay from "./KeyMomentReplay";

type Step = "landing" | "setup" | "video" | "results" | "comparison";
type Leg = "Left" | "Right";
type SessionResults = Partial<Record<Leg, AssessmentResult>>;
const hasLimitedTracking = (result: AssessmentResult) => result.trackingCoverage < 70;

function MetricVisual({ kind }: { kind: "flexion" | "deviation" }) {
  return (
    <span className={`result-visual ${kind}`} aria-hidden="true">
      <i className="visual-line one" /><i className="visual-line two" />
      <i className="visual-joint hip" /><i className="visual-joint knee" /><i className="visual-joint ankle" />
      {kind === "deviation" && <i className="reference-line" />}
    </span>
  );
}

function ResultMetric({ kind, label, value, detail }: { kind: "flexion" | "deviation"; label: string; value: string; detail: string }) {
  return (
    <article className={`result-metric ${kind}`}>
      <MetricVisual kind={kind} />
      <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
    </article>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>("landing");
  const [leg, setLeg] = useState<Leg | null>(null);
  const [results, setResults] = useState<SessionResults>({});
  const [latestResult, setLatestResult] = useState<AssessmentResult | null>(null);

  const goBack = () => {
    if (step === "video") setStep("setup");
    if (step === "setup") setStep("landing");
  };

  const startAssessment = () => {
    setResults({});
    setLatestResult(null);
    setLeg(null);
    setStep("setup");
  };

  const completeAssessment = (result: AssessmentResult) => {
    const updated = { ...results, [result.leg]: result };
    setResults(updated);
    setLatestResult(result);
    setStep(updated.Left && updated.Right ? "comparison" : "results");
  };

  const assessOtherLeg = () => {
    if (!latestResult) return;
    setLeg(latestResult.leg === "Left" ? "Right" : "Left");
    setStep("video");
  };

  const finishAssessment = () => {
    setResults({});
    setLatestResult(null);
    setLeg(null);
    setStep("landing");
  };

  const leftResult = results.Left;
  const rightResult = results.Right;

  return (
    <main className="app-shell">
      <nav className="nav" aria-label="Main navigation">
        <button className="brand" onClick={finishAssessment} aria-label="OrthoVision ACL home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>ORTHOVISION <b>ACL</b></span>
        </button>
        <span className="prototype-badge"><i /> Clinical prototype</span>
      </nav>

      {(step === "setup" || step === "video") && (
        <div className="progress-wrap">
          <button className="back-button" onClick={goBack} aria-label="Go back">← <span>Back</span></button>
          <div className="steps" aria-label={`Step ${step === "setup" ? 1 : 2} of 2`}>
            <span className="step active" />
            <span className={`step ${step === "video" ? "active" : ""}`} />
          </div>
          <span className="step-label">{step === "setup" ? "SETUP" : "VIDEO"} · {step === "setup" ? "1" : "2"}/2</span>
        </div>
      )}

      {step === "landing" && (
        <section className="landing page-enter">
          <div className="eyebrow"><span /> MOVEMENT INTELLIGENCE FOR RECOVERY</div>
          <h1>See the movement.<br /><em>Guide the comeback.</em></h1>
          <p className="hero-copy">Objective, phone-based movement assessment for smarter ACL rehabilitation.</p>
          <button className="primary-button" onClick={startAssessment}>
            Start assessment <span aria-hidden="true">→</span>
          </button>
          <div className="trust-row" aria-label="Product benefits">
            <span><i className="check">✓</i> No sensors required</span>
            <span><i className="check">✓</i> Single-leg squat</span>
            <span><i className="check">✓</i> Built for mobile</span>
          </div>
          <div className="motion-card" aria-hidden="true">
            <div className="motion-grid" />
            <div className="figure">
              <span className="head" /><span className="torso" /><span className="arm left" /><span className="arm right" />
              <span className="leg standing" /><span className="leg raised" />
              {Array.from({ length: 7 }).map((_, i) => <i key={i} className={`joint joint-${i}`} />)}
            </div>
            <span className="angle angle-a">KNEE<br /><b>24°</b></span>
            <span className="angle angle-b">TRUNK<br /><b>8°</b></span>
            <div className="scan-line" />
          </div>
        </section>
      )}

      {step === "setup" && (
        <section className="flow-card page-enter">
          <div className="section-kicker">ASSESSMENT SETUP</div>
          <h2>Which leg are you assessing?</h2>
          <p>Select the side performing the single-leg squat.</p>
          <div className="leg-options">
            {(["Left", "Right"] as Leg[]).map((side) => (
              <button key={side} className={`leg-card ${leg === side ? "selected" : ""}`} onClick={() => setLeg(side)} aria-pressed={leg === side}>
                <span className={`leg-visual ${side.toLowerCase()}`} aria-hidden="true"><i className="upper" /><i className="lower" /><i className="foot" /></span>
                <span><b>{side} leg</b><small>{side.toUpperCase()} SIDE</small></span>
                <i className="radio" />
              </button>
            ))}
          </div>
          <button className="primary-button continue" disabled={!leg} onClick={() => setStep("video")}>
            Continue <span aria-hidden="true">→</span>
          </button>
          <p className="hint">You can change this before starting the assessment.</p>
        </section>
      )}

      {step === "video" && (
        <section className="flow-card video-card page-enter">
          <div className="selected-leg"><i /> {leg} leg selected</div>
          <div className="section-kicker">ADD YOUR VIDEO</div>
          <h2>Record your single-leg squat</h2>
          <p>Position the camera so your full body stays visible from the front.</p>
          <PoseVideo selectedLeg={leg!} onComplete={completeAssessment} />
        </section>
      )}

      {step === "results" && latestResult && (
        <section className="results-screen page-enter">
          <div className="completion-mark" aria-hidden="true">✓</div>
          <div className="section-kicker">ASSESSMENT COMPLETE</div>
          <h2>{latestResult.leg} leg results</h2>
          <p className="results-intro">Objective measurements captured during this single-leg squat.</p>
          <div className="result-metrics">
            <ResultMetric kind="flexion" label="Maximum Knee Flexion" value={`${latestResult.maximumFlexion}°`} detail="Robust peak · 95th percentile of valid frames" />
            <ResultMetric kind="deviation" label="Maximum Medial Knee Deviation" value={`${latestResult.maximumMedialDeviation.toFixed(1)}%`} detail="Normalized to detected leg length" />
          </div>
          <div className="tracking-summary">
            <span><small>LANDMARK TRACKING COVERAGE</small><b>{latestResult.trackingCoverage}%</b></span>
            <div className="tracking-bar" aria-label={`${latestResult.trackingCoverage}% of analyzed frames had confident hip, knee, and ankle landmarks`}><i style={{ width: `${latestResult.trackingCoverage}%` }} /></div>
            <p>Percentage of analyzed frames with confident hip, knee, and ankle landmarks.</p>
          </div>
          {hasLimitedTracking(latestResult) && <p className="tracking-warning" role="alert">Limited tracking coverage — consider repeating the assessment with your full body visible.</p>}
          <KeyMomentReplay result={latestResult} />
          <div className="results-actions">
            <button className="primary-button" onClick={assessOtherLeg}>Assess other leg <span aria-hidden="true">→</span></button>
            <button className="secondary-button" onClick={finishAssessment}>Finish assessment</button>
          </div>
          <p className="session-note">Results are held in this browser tab for the current assessment only.</p>
        </section>
      )}

      {step === "comparison" && leftResult && rightResult && (
        <section className="results-screen comparison-screen page-enter">
          <div className="section-kicker">BILATERAL SUMMARY</div>
          <h2>Left vs right comparison</h2>
          <p className="results-intro">A side-by-side view of the two objective assessment measurements.</p>
          <div className="comparison-legs" aria-label="Assessed legs">
            <span><i /> Left leg complete</span><span><i /> Right leg complete</span>
          </div>
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead><tr><th>Measurement</th><th>Left</th><th>Right</th><th>Absolute difference</th></tr></thead>
              <tbody>
                <tr><th>Maximum Knee Flexion</th><td className={hasLimitedTracking(leftResult) ? "limited-value" : ""}>{leftResult.maximumFlexion}°</td><td className={hasLimitedTracking(rightResult) ? "limited-value" : ""}>{rightResult.maximumFlexion}°</td><td>{Math.abs(leftResult.maximumFlexion - rightResult.maximumFlexion)}°</td></tr>
                <tr><th>Maximum Medial Knee Deviation</th><td className={hasLimitedTracking(leftResult) ? "limited-value" : ""}>{leftResult.maximumMedialDeviation.toFixed(1)}%</td><td className={hasLimitedTracking(rightResult) ? "limited-value" : ""}>{rightResult.maximumMedialDeviation.toFixed(1)}%</td><td>{Math.abs(leftResult.maximumMedialDeviation - rightResult.maximumMedialDeviation).toFixed(1)}%</td></tr>
              </tbody>
            </table>
          </div>
          <div className="comparison-tracking">
            <span className={hasLimitedTracking(leftResult) ? "limited-tracking" : ""}>Left tracking coverage <b>{leftResult.trackingCoverage}%</b>{hasLimitedTracking(leftResult) && <em>Limited</em>}</span>
            <span className={hasLimitedTracking(rightResult) ? "limited-tracking" : ""}>Right tracking coverage <b>{rightResult.trackingCoverage}%</b>{hasLimitedTracking(rightResult) && <em>Limited</em>}</span>
          </div>
          {(hasLimitedTracking(leftResult) || hasLimitedTracking(rightResult)) && <p className="tracking-warning comparison-warning" role="alert">Limited tracking coverage — consider repeating the affected assessment with your full body visible.</p>}
          <button className="primary-button finish-results" onClick={finishAssessment}>Finish assessment <span aria-hidden="true">→</span></button>
          <p className="session-note">Deviation values are normalized to detected leg length.</p>
        </section>
      )}

      <footer><span>ORTHOVISION ACL · MVP</span><span>FOR REHABILITATION ASSESSMENT</span></footer>
    </main>
  );
}
