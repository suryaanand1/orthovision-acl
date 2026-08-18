"use client";

import { useEffect, useRef, useState } from "react";
import type { AssessmentResult, KeyMomentFrame } from "./PoseVideo";

type MomentKind = "flexion" | "deviation";
const CONNECTIONS: Array<[number, number]> = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export default function KeyMomentReplay({ result }: { result: AssessmentResult }) {
  const [selected, setSelected] = useState<MomentKind>("flexion");
  const [videoUrl] = useState(() => URL.createObjectURL(result.videoBlob));
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const moment = selected === "flexion" ? result.peakFlexionMoment : result.peakDeviationMoment;

  useEffect(() => {
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const drawOverlay = (frame: KeyMomentFrame) => {
    const media = video.current;
    const layer = canvas.current;
    if (!media || !layer || !media.videoWidth) return;
    layer.width = media.videoWidth;
    layer.height = media.videoHeight;
    const context = layer.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, layer.width, layer.height);
    context.lineCap = "round";
    context.lineWidth = Math.max(3, layer.width / 180);
    context.strokeStyle = "#c8ff48";
    context.shadowColor = "rgba(200,255,72,.7)";
    context.shadowBlur = 7;
    for (const [from, to] of CONNECTIONS) {
      const start = frame.landmarks[from];
      const end = frame.landmarks[to];
      if ((start.visibility ?? 1) < 0.45 || (end.visibility ?? 1) < 0.45) continue;
      context.beginPath();
      context.moveTo(start.x * layer.width, start.y * layer.height);
      context.lineTo(end.x * layer.width, end.y * layer.height);
      context.stroke();
    }
    const indices = result.leg === "Left" ? { hip: 23, knee: 25, ankle: 27 } : { hip: 24, knee: 26, ankle: 28 };
    const hip = frame.landmarks[indices.hip];
    const knee = frame.landmarks[indices.knee];
    const ankle = frame.landmarks[indices.ankle];
    const kneeX = knee.x * layer.width;
    const kneeY = knee.y * layer.height;
    context.shadowBlur = 0;
    context.strokeStyle = selected === "flexion" ? "#ffffff" : "#ffad66";
    context.lineWidth = Math.max(3, layer.width / 220);
    if (selected === "deviation") {
      context.setLineDash([10, 7]);
      context.beginPath();
      context.moveTo(hip.x * layer.width, hip.y * layer.height);
      context.lineTo(ankle.x * layer.width, ankle.y * layer.height);
      context.stroke();
      context.setLineDash([]);
    }
    context.beginPath();
    context.arc(kneeX, kneeY, Math.max(10, layer.width / 55), 0, Math.PI * 2);
    context.stroke();
  };

  const seekToMoment = () => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = Math.min(moment.timestamp, video.current.duration || moment.timestamp);
  };

  useEffect(() => {
    seekToMoment();
  // The selected timestamp is the intentional trigger for seeking.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, videoUrl]);

  return (
    <section className="key-moments" aria-labelledby="key-moments-title">
      <div className="key-moments-heading"><div><small>VIDEO REVIEW</small><h3 id="key-moments-title">Key Moments</h3></div><span>{result.leg} leg assessment</span></div>
      <div className="moment-tabs" role="group" aria-label="Choose a key moment">
        <button className={selected === "flexion" ? "active" : ""} onClick={() => setSelected("flexion")}><small>PEAK KNEE FLEXION</small><b>{result.maximumFlexion}°</b><span>{formatTimestamp(result.peakFlexionMoment.timestamp)}</span></button>
        <button className={selected === "deviation" ? "active" : ""} onClick={() => setSelected("deviation")}><small>PEAK MEDIAL KNEE DEVIATION</small><b>{result.maximumMedialDeviation.toFixed(1)}%</b><span>{formatTimestamp(result.peakDeviationMoment.timestamp)}</span></button>
      </div>
      <div className="moment-viewer">
        {/* Assessment clips are visual-only inputs; audio is not part of the review. */}
        <video ref={video} src={videoUrl} playsInline muted onLoadedMetadata={seekToMoment} onSeeked={() => { video.current?.pause(); drawOverlay(moment); }} />
        <canvas ref={canvas} aria-hidden="true" />
        <span className="moment-label">{selected === "flexion" ? "REPRESENTATIVE 95TH-PERCENTILE FLEXION FRAME" : "MAXIMUM MEDIAL DEVIATION FRAME"}</span>
        <span className="moment-time">{formatTimestamp(moment.timestamp)}</span>
      </div>
      <p>{selected === "flexion" ? `Paused at the analyzed frame nearest the ${result.maximumFlexion}° robust peak.` : `Paused at the analyzed frame where ${result.maximumMedialDeviation.toFixed(1)}% medial deviation was recorded.`}</p>
    </section>
  );
}
