# OrthoVision ACL

**Browser-based movement measurement for single-leg squats during ACL rehabilitation.**

[**Live demo**](https://orthovision-acl.vercel.app/) · [Source code](https://github.com/suryaanand1/orthovision-acl)

OrthoVision ACL is a mobile-friendly prototype exploring what can be measured from an ordinary single-leg squat video without force plates or wearables. It is **not** a medical device, diagnostic tool, injury-risk predictor, or return-to-sport clearance system.

## Features

- Upload a squat video or record one directly with a phone/laptop camera.
- Run MediaPipe Pose Landmarker locally in the browser, with a skeletal overlay.
- Estimate knee flexion using 3D hip, knee, and ankle landmarks.
- Measure 2D frontal knee deviation relative to the hip-to-ankle line, normalized by detected leg length.
- Filter landmarks based on tracking confidence and warn when valid tracking coverage is below 70%.
- Replay timestamped peak-flexion and maximum medial-deviation moments with pose overlays.
- Assess both legs in one session and compare movement measurements side by side.
- Keep video frames and computed measurements in the browser rather than uploading recordings to an application server.

## Engineering decisions

**Peak knee flexion:** Instead of reporting the single largest observed angle (which can be distorted by a tracking outlier), the app reports the **95th percentile of valid-frame knee-flexion angles**.

**Frontal knee deviation:** The selected knee's displacement from the hip-to-ankle reference line is normalized by detected leg length to reduce the effect of subject-to-camera distance. This is an **image-plane measurement**, not calibrated 3D biomechanics.

**Quality and interpretability:** Low-confidence landmarks are filtered out. Tracking-coverage warnings and key-moment replay help users see how reported measurements relate to the underlying video.

## Technology

Next.js · React · TypeScript · Tailwind CSS · MediaPipe Pose Landmarker · HTML Canvas · MediaRecorder / MediaDevices APIs · Vercel

### Source code landmarks

- [Video capture, pose tracking, and measurement collection](app/PoseVideo.tsx)
- [Knee-angle and percentile utilities](app/measurementMath.ts)
- [Assessment and bilateral comparison flow](app/page.tsx)
- [Timestamped key-moment replay](app/KeyMomentReplay.tsx)

## Try the demo

1. Open [orthovision-acl.vercel.app](https://orthovision-acl.vercel.app/).
2. Choose the leg to assess.
3. Upload or record a single-leg squat video.
4. Review knee flexion, normalized frontal deviation, and tracking coverage.
5. Replay key moments; optionally repeat for the other leg.

Use consistent camera placement and ensure the hip, knee, and ankle stay visible. For camera recording, grant the browser camera permission.

## Run locally

Requires Node.js 22.13+.

```bash
git clone https://github.com/suryaanand1/orthovision-acl.git
cd orthovision-acl
npm install
npm run dev
```

Open http://localhost:3000. Run `npm run build` or `npm run lint` for additional checks.

## Limitations

This is an **engineering/hackathon prototype**, not clinically validated software. It does not diagnose ACL injuries, score injury risk, recommend treatment, apply clinical thresholds, or determine clearance to return to sport. Pose accuracy depends on camera angle, occlusion, lighting, motion blur, and the model's tracking quality. The 95th-percentile and leg-length normalization choices improve robustness but do not establish clinical validity. Side-to-side differences are descriptive only.

## Future work

Evaluate measurement repeatability under different camera conditions, compare estimates against calibrated reference methods, and improve feedback when tracking is inadequate.
