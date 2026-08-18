"use client";

import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { kneeFlexion3D, percentile } from "./measurementMath";

const CONNECTIONS: Array<[number, number]> = [
  [11, 12], // shoulders
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
];
const JOINTS = [11, 12, 23, 24, 25, 26, 27, 28];

type Source = "empty" | "upload" | "camera" | "recorded";
export type AssessmentLeg = "Left" | "Right";

export type AssessmentResult = {
  leg: AssessmentLeg;
  maximumFlexion: number;
  maximumMedialDeviation: number;
  trackingCoverage: number;
  videoBlob: Blob;
  peakFlexionMoment: KeyMomentFrame;
  peakDeviationMoment: KeyMomentFrame;
};

export type KeyMomentFrame = {
  timestamp: number;
  value: number;
  landmarks: NormalizedLandmark[];
};

const LEG_LANDMARKS: Record<AssessmentLeg, { hip: number; knee: number; ankle: number }> = {
  Left: { hip: 23, knee: 25, ankle: 27 },
  Right: { hip: 24, knee: 26, ankle: 28 },
};

function calculateLegMetrics(landmarks: NormalizedLandmark[], worldLandmarks: NormalizedLandmark[] | undefined, selectedLeg: AssessmentLeg) {
  const indices = LEG_LANDMARKS[selectedLeg];
  const hip = landmarks[indices.hip];
  const knee = landmarks[indices.knee];
  const ankle = landmarks[indices.ankle];
  const confident = (point: NormalizedLandmark & { presence?: number }) =>
    (point.visibility ?? 0) >= 0.6 && (point.presence ?? 1) >= 0.6;
  if (!confident(hip) || !confident(knee) || !confident(ankle)) return null;

  const worldHip = worldLandmarks?.[indices.hip];
  const worldKnee = worldLandmarks?.[indices.knee];
  const worldAnkle = worldLandmarks?.[indices.ankle];
  if (!worldHip || !worldKnee || !worldAnkle || !confident(worldHip) || !confident(worldKnee) || !confident(worldAnkle)) return null;
  const flexion = kneeFlexion3D(worldHip, worldKnee, worldAnkle);
  if (flexion === null) return null;

  const thigh = { x: hip.x - knee.x, y: hip.y - knee.y };
  const shin = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const thighLength = Math.hypot(thigh.x, thigh.y);
  const shinLength = Math.hypot(shin.x, shin.y);
  if (thighLength < 0.001 || shinLength < 0.001) return null;
  const reference = { x: ankle.x - hip.x, y: ankle.y - hip.y };
  const referenceLength = Math.hypot(reference.x, reference.y);
  if (referenceLength < 0.001) return null;
  const hipToKnee = { x: knee.x - hip.x, y: knee.y - hip.y };
  const projectionScale = (hipToKnee.x * reference.x + hipToKnee.y * reference.y) / (referenceLength * referenceLength);
  const projection = {
    x: hip.x + projectionScale * reference.x,
    y: hip.y + projectionScale * reference.y,
  };
  const signedDistance = (reference.x * hipToKnee.y - reference.y * hipToKnee.x) / referenceLength;
  const medialDistance = selectedLeg === "Left" ? signedDistance : -signedDistance;
  const medialDeviation = (medialDistance / (thighLength + shinLength)) * 100;
  return { flexion, medialDeviation, projection, hip, knee, ankle };
}

function cameraMessage(error: unknown) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Camera access is not supported in this browser. You can upload a video instead.";
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Camera permission was denied. Allow camera access in your browser settings, or upload a video instead.";
    if (error.name === "NotFoundError") return "No camera was found on this device. You can upload a video instead.";
    if (error.name === "NotReadableError") return "Your camera is being used by another app. Close that app and try again.";
  }
  return "The camera could not be started. Please try again or upload a video instead.";
}

export default function PoseVideo({ selectedLeg, onComplete }: { selectedLeg: AssessmentLeg; onComplete: (result: AssessmentResult) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const landmarker = useRef<PoseLandmarker | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const objectUrl = useRef<string | null>(null);
  const assessmentVideo = useRef<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAt = useRef(0);
  const trackMaximum = useRef(false);
  const flexionMeasurements = useRef<number[]>([]);
  const flexionFrames = useRef<KeyMomentFrame[]>([]);
  const maximumMedialDeviationRef = useRef<number | null>(null);
  const peakDeviationFrame = useRef<KeyMomentFrame | null>(null);
  const processedFrames = useRef(0);
  const trackedFrames = useRef(0);
  const completionSent = useRef(false);
  const animationFrame = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const [source, setSource] = useState<Source>("empty");
  const [status, setStatus] = useState("Preparing pose detection…");
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingAccepted, setRecordingAccepted] = useState(false);
  const [currentFlexion, setCurrentFlexion] = useState<number | null>(null);
  const [currentDeviation, setCurrentDeviation] = useState<number | null>(null);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainder = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  };

  const stopTimer = () => {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    recordingTimer.current = null;
  };

  const stopCamera = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  const releaseObjectUrl = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };

  const clearCanvas = () => {
    const context = canvas.current?.getContext("2d");
    if (context && canvas.current) context.clearRect(0, 0, canvas.current.width, canvas.current.height);
  };

  const resetMeasurement = () => {
    setCurrentFlexion(null);
    setCurrentDeviation(null);
    flexionMeasurements.current = [];
    flexionFrames.current = [];
    maximumMedialDeviationRef.current = null;
    peakDeviationFrame.current = null;
    processedFrames.current = 0;
    trackedFrames.current = 0;
    completionSent.current = false;
  };

  const drawPose = useCallback((landmarks?: NormalizedLandmark[], worldLandmarks?: NormalizedLandmark[]) => {
    const layer = canvas.current;
    const media = video.current;
    if (!layer || !media) return;

    if (layer.width !== media.videoWidth || layer.height !== media.videoHeight) {
      layer.width = media.videoWidth;
      layer.height = media.videoHeight;
    }
    const context = layer.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, layer.width, layer.height);
    processedFrames.current += 1;
    if (!landmarks) {
      setCurrentFlexion(null);
      setCurrentDeviation(null);
      return;
    }

    const visible = (point: NormalizedLandmark) => (point.visibility ?? 1) > 0.45;
    context.lineWidth = Math.max(3, layer.width / 180);
    context.lineCap = "round";
    context.strokeStyle = "#c8ff48";
    context.shadowColor = "rgba(200,255,72,.7)";
    context.shadowBlur = 7;
    for (const [from, to] of CONNECTIONS) {
      const start = landmarks[from];
      const end = landmarks[to];
      if (!visible(start) || !visible(end)) continue;
      context.beginPath();
      context.moveTo(start.x * layer.width, start.y * layer.height);
      context.lineTo(end.x * layer.width, end.y * layer.height);
      context.stroke();
    }

    context.shadowBlur = 4;
    context.fillStyle = "#f7fff0";
    context.strokeStyle = "#64851b";
    context.lineWidth = Math.max(2, layer.width / 320);
    for (const index of JOINTS) {
      const point = landmarks[index];
      if (!visible(point)) continue;
      context.beginPath();
      context.arc(point.x * layer.width, point.y * layer.height, Math.max(4, layer.width / 115), 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    const measurement = calculateLegMetrics(landmarks, worldLandmarks, selectedLeg);
    if (!measurement) {
      setCurrentFlexion(null);
      setCurrentDeviation(null);
      return;
    }
    const roundedFlexion = Math.round(measurement.flexion);
    const roundedDeviation = Math.round(measurement.medialDeviation * 10) / 10;
    trackedFrames.current += 1;
    setCurrentFlexion(roundedFlexion);
    setCurrentDeviation(roundedDeviation);
    if (trackMaximum.current) {
      flexionMeasurements.current.push(measurement.flexion);
      flexionFrames.current.push({ timestamp: media.currentTime, value: measurement.flexion, landmarks: landmarks.map((point) => ({ ...point })) });
      const medialValue = Math.max(0, roundedDeviation);
      const nextDeviation = maximumMedialDeviationRef.current === null ? medialValue : Math.max(maximumMedialDeviationRef.current, medialValue);
      if (maximumMedialDeviationRef.current === null || medialValue > maximumMedialDeviationRef.current) {
        peakDeviationFrame.current = { timestamp: media.currentTime, value: medialValue, landmarks: landmarks.map((point) => ({ ...point })) };
      }
      maximumMedialDeviationRef.current = nextDeviation;
    }

    const kneeX = measurement.knee.x * layer.width;
    const kneeY = measurement.knee.y * layer.height;
    const hipAngle = Math.atan2(measurement.hip.y - measurement.knee.y, measurement.hip.x - measurement.knee.x);
    const ankleAngle = Math.atan2(measurement.ankle.y - measurement.knee.y, measurement.ankle.x - measurement.knee.x);
    const hipX = measurement.hip.x * layer.width;
    const hipY = measurement.hip.y * layer.height;
    const ankleX = measurement.ankle.x * layer.width;
    const ankleY = measurement.ankle.y * layer.height;
    const projectionX = measurement.projection.x * layer.width;
    const projectionY = measurement.projection.y * layer.height;
    context.save();
    context.shadowBlur = 0;
    context.setLineDash([10, 7]);
    context.strokeStyle = "rgba(255,255,255,.9)";
    context.lineWidth = Math.max(2, layer.width / 300);
    context.beginPath();
    context.moveTo(hipX, hipY);
    context.lineTo(ankleX, ankleY);
    context.stroke();
    context.setLineDash([]);
    context.strokeStyle = "#ffad66";
    context.lineWidth = Math.max(3, layer.width / 220);
    context.beginPath();
    context.moveTo(projectionX, projectionY);
    context.lineTo(kneeX, kneeY);
    context.stroke();
    context.strokeStyle = "#ffad66";
    context.lineWidth = Math.max(2, layer.width / 260);
    context.beginPath();
    context.arc(kneeX, kneeY, Math.max(9, layer.width / 60), 0, Math.PI * 2);
    context.stroke();
    context.restore();
    let sweep = ankleAngle - hipAngle;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const radius = Math.max(18, layer.width / 18);
    context.save();
    context.shadowBlur = 5;
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(2, layer.width / 260);
    context.beginPath();
    context.arc(kneeX, kneeY, radius, hipAngle, hipAngle + sweep, sweep < 0);
    context.stroke();
    context.fillStyle = "#c8ff48";
    context.font = `700 ${Math.max(12, layer.width / 35)}px Arial`;
    context.fillText(`${roundedFlexion}°`, kneeX + radius + 5, kneeY - 4);
    context.restore();
  }, [selectedLeg]);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/pose_landmarker_lite.task", delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) return poseLandmarker.close();
        landmarker.current = poseLandmarker;
        setStatus("Pose detection ready");
      } catch {
        setError("Pose detection could not be loaded. Refresh the page and try again.");
        setStatus("Pose detection unavailable");
      }
    };
    setup();

    return () => {
      cancelled = true;
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      stopTimer();
      if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stopCamera();
      releaseObjectUrl();
      landmarker.current?.close();
    };
  }, []);

  useEffect(() => {
    const detect = () => {
      const media = video.current;
      if (media && landmarker.current && media.readyState >= 2 && !media.paused && media.currentTime !== lastVideoTime.current) {
        lastVideoTime.current = media.currentTime;
        try {
          const result = landmarker.current.detectForVideo(media, performance.now());
          drawPose(result.landmarks[0], result.worldLandmarks[0]);
          setStatus(result.landmarks.length ? "Pose detected" : "Move your full body into view");
        } catch {
          setStatus("Pose detection paused");
        }
      }
      animationFrame.current = requestAnimationFrame(detect);
    };
    animationFrame.current = requestAnimationFrame(detect);
    return () => { if (animationFrame.current) cancelAnimationFrame(animationFrame.current); };
  }, [drawPose]);

  const uploadVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !video.current) return;
    stopCamera();
    releaseObjectUrl();
    objectUrl.current = URL.createObjectURL(file);
    assessmentVideo.current = file;
    video.current.srcObject = null;
    video.current.src = objectUrl.current;
    video.current.controls = true;
    video.current.muted = false;
    lastVideoTime.current = -1;
    clearCanvas();
    setSource("upload");
    resetMeasurement();
    trackMaximum.current = true;
    setRecordingAccepted(false);
    setError(null);
    setStatus(landmarker.current ? "Play the video to detect your pose" : "Preparing pose detection…");
  };

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(cameraMessage(null));
      return;
    }
    try {
      stopCamera();
      releaseObjectUrl();
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stream.current = cameraStream;
      if (!video.current) return stopCamera();
      video.current.removeAttribute("src");
      video.current.srcObject = cameraStream;
      video.current.controls = false;
      video.current.muted = true;
      await video.current.play();
      lastVideoTime.current = -1;
      clearCanvas();
      setSource("camera");
      trackMaximum.current = false;
      resetMeasurement();
      setIsRecording(false);
      setRecordingSeconds(0);
      setRecordingAccepted(false);
      setStatus(landmarker.current ? "Camera live · looking for pose" : "Camera live · preparing pose detection…");
    } catch (cameraError) {
      stopCamera();
      setSource("empty");
      setError(cameraMessage(cameraError));
      setStatus("Camera unavailable");
    }
  };

  const preferredRecordingType = () => {
    const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  };

  const startRecording = () => {
    setError(null);
    if (!stream.current || !video.current) {
      setError("The camera is not ready yet. Try opening the camera again.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Camera recording is not supported in this browser. You can still upload a video instead.");
      return;
    }

    try {
      recordedChunks.current = [];
      const mimeType = preferredRecordingType();
      const mediaRecorder = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        stopTimer();
        const clip = new Blob(recordedChunks.current, { type: mediaRecorder.mimeType || "video/webm" });
        if (!clip.size || !video.current) {
          setError("The recording could not be created. Please retake it or upload a video.");
          setIsRecording(false);
          return;
        }
        releaseObjectUrl();
        objectUrl.current = URL.createObjectURL(clip);
        assessmentVideo.current = clip;
        stopCamera();
        video.current.srcObject = null;
        video.current.src = objectUrl.current;
        video.current.controls = true;
        video.current.muted = false;
        video.current.load();
        lastVideoTime.current = -1;
        clearCanvas();
        setSource("recorded");
        resetMeasurement();
        trackMaximum.current = true;
        setIsRecording(false);
        setRecordingAccepted(false);
        setStatus("Recording ready · play to detect your pose");
      };
      mediaRecorder.onerror = () => {
        stopTimer();
        setIsRecording(false);
        setError("Recording stopped unexpectedly. Please try again.");
      };
      mediaRecorder.start(250);
      resetMeasurement();
      trackMaximum.current = true;
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
      setStatus("Recording assessment");
      recordingTimer.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt.current) / 1000));
      }, 250);
    } catch {
      setError("Recording could not start in this browser. You can upload a video instead.");
    }
  };

  const stopRecording = () => {
    if (!recorder.current || recorder.current.state === "inactive") return;
    setStatus("Finishing recording…");
    recorder.current.stop();
  };

  const useRecording = () => {
    setRecordingAccepted(true);
    setStatus("Recording selected · ready for assessment");
  };

  const retake = async () => {
    setRecordingAccepted(false);
    setRecordingSeconds(0);
    releaseObjectUrl();
    assessmentVideo.current = null;
    clearCanvas();
    trackMaximum.current = false;
    resetMeasurement();
    await openCamera();
  };

  const finishAssessment = () => {
    clearCanvas();
    setCurrentFlexion(null);
    setCurrentDeviation(null);
    if (source === "upload" || source === "recorded") {
      trackMaximum.current = false;
      setStatus("Assessment playback complete");
      const robustFlexion = percentile(flexionMeasurements.current, 0.95);
      const flexion = robustFlexion === null ? null : Math.round(robustFlexion);
      const deviation = maximumMedialDeviationRef.current;
      const flexionMoment = robustFlexion === null ? null : flexionFrames.current.reduce<KeyMomentFrame | null>((nearest, frame) =>
        !nearest || Math.abs(frame.value - robustFlexion) < Math.abs(nearest.value - robustFlexion) ? frame : nearest, null);
      const deviationMoment = peakDeviationFrame.current;
      if (!completionSent.current && flexion !== null && deviation !== null && flexionMoment && deviationMoment && assessmentVideo.current) {
        completionSent.current = true;
        const trackingCoverage = processedFrames.current > 0
          ? Math.round((trackedFrames.current / processedFrames.current) * 100)
          : 0;
        onComplete({ leg: selectedLeg, maximumFlexion: flexion, maximumMedialDeviation: deviation, trackingCoverage, videoBlob: assessmentVideo.current, peakFlexionMoment: flexionMoment, peakDeviationMoment: deviationMoment });
      }
    }
  };

  return (
    <>
      <div className={`video-frame ${source !== "empty" ? "has-media" : ""}`}>
        <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        {source === "empty" && <div className="phone-figure" aria-hidden="true"><i className="pf-head" /><i className="pf-body" /><i className="pf-leg-one" /><i className="pf-leg-two" /><i className="ground" /></div>}
        {/* Assessment clips are visual-only inputs; audio is not part of the analysis. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={video} playsInline onPlay={() => { if (source !== "camera") trackMaximum.current = true; }} onEnded={finishAssessment} aria-label={source === "camera" ? "Live camera preview" : source === "recorded" ? "Recorded assessment video" : "Uploaded assessment video"} />
        <canvas ref={canvas} aria-hidden="true" />
        <span className="frame-label">{source === "empty" ? "FULL BODY IN FRAME" : status.toUpperCase()}</span>
        {source !== "empty" && (
          <div className="live-metrics">
            <span className="angle-readout"><small>{selectedLeg.toUpperCase()} KNEE FLEXION</small><b>{currentFlexion === null ? "—" : `${currentFlexion}°`}</b></span>
            <span className="deviation-readout"><small>FRONTAL KNEE DEVIATION</small><b>{currentDeviation === null ? "—" : `${Math.abs(currentDeviation).toFixed(1)}%`}</b><em>{currentDeviation === null ? "LOW CONFIDENCE" : currentDeviation >= 0 ? "MEDIAL" : "LATERAL"}</em></span>
          </div>
        )}
        {source === "camera" && <span className={`live-badge ${isRecording ? "recording" : ""}`}><i /> {isRecording ? `REC ${formatTime(recordingSeconds)}` : "LIVE"}</span>}
      </div>
      {error && <p className="media-error" role="alert">{error}</p>}
      <input ref={fileInput} type="file" accept="video/*" hidden onChange={uploadVideo} />
      {source === "camera" ? (
        <div className="recording-actions">
          <button className={`record-button ${isRecording ? "stop" : ""}`} onClick={isRecording ? stopRecording : startRecording}>
            <span className="record-dot" /> {isRecording ? "Stop recording" : "Start recording"}
          </button>
          {!isRecording && <button className="text-action" onClick={() => fileInput.current?.click()}>Upload instead</button>}
        </div>
      ) : source === "recorded" ? (
        <div className="video-actions recorded-actions">
          <button className="primary-button" onClick={useRecording} disabled={recordingAccepted}><span className="action-icon">✓</span> {recordingAccepted ? "Recording selected" : "Use recording"}</button>
          <button className="secondary-button" onClick={retake}><span className="retake-icon">↻</span> Retake</button>
        </div>
      ) : (
        <div className="video-actions">
          <button className="primary-button" onClick={() => fileInput.current?.click()}><span className="action-icon">↑</span> Upload video</button>
          <button className="secondary-button" onClick={openCamera}><span className="action-icon camera-icon" /> Use camera</button>
        </div>
      )}
      <p className="privacy"><span>⌾</span> Your video stays on this device during this prototype.</p>
    </>
  );
}
