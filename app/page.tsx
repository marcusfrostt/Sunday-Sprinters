"use client";

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type StyleKey = "classic" | "bold" | "dead";
type Clip = { file: File; url: string; duration: number };
type Analysis = {
  selectedClipIndex: number;
  start: number;
  end: number;
  topText: string;
  bottomText: string;
  instagramCaption: string;
  reason: string;
  confidence: number;
};

const STYLE_LABELS: Record<StyleKey, string> = {
  classic: "Classic",
  bold: "Bold",
  dead: "Dead serious",
};

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readDuration(url: string) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("Could not read video metadata."));
    video.src = url;
  });
}

async function sampleFrame(clip: Clip, time: number) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = clip.url;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`Could not analyze ${clip.file.name}.`));
  });

  video.currentTime = Math.min(time, Math.max(0, clip.duration - 0.1));
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 216;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a video sample.");

  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = canvas.width / canvas.height;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (sourceRatio > targetRatio) {
    sourceWidth = video.videoHeight * targetRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    sourceHeight = video.videoWidth / targetRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }
  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.62);
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number | null>(null);
  const drawFrameRef = useRef<() => void>(() => undefined);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const [topText, setTopText] = useState("ME: EASY SPIN TODAY");
  const [bottomText, setBottomText] = useState("ALSO ME: 480 WATTS UP EVERY HILL");
  const [style, setStyle] = useState<StyleKey>("dead");
  const [currentTime, setCurrentTime] = useState(0);
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [message, setMessage] = useState("Add up to four clips to begin.");

  const selectedClip = clips[selectedClipIndex];

  const acceptFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith("video/"))
      .slice(0, 4);
    if (!files.length) {
      setMessage("Choose one or more video files, please.");
      return;
    }

    setMessage("Reading your clips…");
    try {
      const nextClips = await Promise.all(
        files.map(async (file) => {
          const url = URL.createObjectURL(file);
          const duration = await readDuration(url);
          return { file, url, duration };
        }),
      );
      setClips((previous) => {
        previous.forEach((clip) => URL.revokeObjectURL(clip.url));
        return nextClips;
      });
      setSelectedClipIndex(0);
      setSegmentStart(0);
      setSegmentEnd(Math.min(8, nextClips[0].duration));
      setAnalysis(null);
      setMessage(`${nextClips.length} clip${nextClips.length > 1 ? "s" : ""} loaded. Let AI find the moment.`);
    } catch {
      setMessage("One of those clips could not be opened. Try MP4 or MOV.");
    }
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) acceptFiles(event.target.files);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFiles(event.dataTransfer.files);
  };

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;

    context.fillStyle = "#181814";
    context.fillRect(0, 0, width, height);
    if (video && video.readyState >= 2 && video.videoWidth) {
      const sourceRatio = video.videoWidth / video.videoHeight;
      const targetRatio = width / height;
      let sourceWidth = video.videoWidth;
      let sourceHeight = video.videoHeight;
      let sourceX = 0;
      let sourceY = 0;
      if (sourceRatio > targetRatio) {
        sourceWidth = video.videoHeight * targetRatio;
        sourceX = (video.videoWidth - sourceWidth) / 2;
      } else {
        sourceHeight = video.videoWidth / targetRatio;
        sourceY = (video.videoHeight - sourceHeight) / 2;
      }
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
      context.fillStyle = "rgba(0,0,0,.12)";
      context.fillRect(0, 0, width, height);
    } else {
      context.strokeStyle = "#44443c";
      context.lineWidth = 2;
      context.setLineDash([12, 12]);
      context.strokeRect(28, 28, width - 56, height - 56);
      context.setLineDash([]);
      context.fillStyle = "#f1ead9";
      context.textAlign = "center";
      context.font = "700 42px Arial Narrow, sans-serif";
      context.fillText("YOUR RIDE GOES HERE", width / 2, height / 2);
    }

    const renderCaption = (text: string, y: number, alignBottom = false) => {
      const content = text.trim().toUpperCase() || "ADD YOUR TEXT";
      const maxWidth = width - 80;
      const fontSize = style === "classic" ? 38 : style === "bold" ? 52 : 46;
      context.font = `${style === "classic" ? 700 : 900} ${fontSize}px Arial Narrow, Impact, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const words = content.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (context.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      if (line) lines.push(line);
      const lineHeight = fontSize * 1.04;
      const boxHeight = lines.length * lineHeight + 30;
      const boxY = alignBottom ? y - boxHeight : y;
      context.fillStyle = style === "classic" ? "rgba(243,238,223,.92)" : "rgba(8,8,7,.92)";
      context.fillRect(28, boxY, width - 56, boxHeight);
      context.fillStyle = style === "classic" ? "#0b0b0a" : "#f3eedf";
      lines.forEach((captionLine, index) => {
        context.fillText(captionLine, width / 2, boxY + 19 + lineHeight * index + lineHeight / 2);
      });
    };

    renderCaption(topText, 58);
    renderCaption(bottomText, height - 58, true);
    context.fillStyle = "#dfff00";
    context.fillRect(28, height - 22, 118, 6);
    context.fillStyle = "#f3eedf";
    context.textAlign = "right";
    context.textBaseline = "alphabetic";
    context.font = "700 14px ui-monospace, monospace";
    context.fillText("SUNDAY SPRINTERS", width - 28, height - 14);

    if (video && !video.paused && !video.ended) {
      animationRef.current = requestAnimationFrame(() => drawFrameRef.current());
    }
  }, [bottomText, style, topText]);

  useEffect(() => {
    drawFrameRef.current = drawFrame;
    drawFrame();
  }, [drawFrame, selectedClipIndex]);

  useEffect(() => {
    return () => {
      clips.forEach((clip) => URL.revokeObjectURL(clip.url));
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [clips]);

  const analyzeClips = async () => {
    if (!clips.length || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    setMessage("AI is scanning twelve moments for cycling meme potential…");
    try {
      const frames: { clipIndex: number; time: number; dataUrl: string }[] = [];
      for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
        const clip = clips[clipIndex];
        for (const fraction of [0.2, 0.5, 0.8]) {
          const time = Math.max(0, clip.duration * fraction);
          frames.push({ clipIndex, time, dataUrl: await sampleFrame(clip, time) });
        }
      }
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clips: clips.map((clip) => ({ name: clip.file.name, duration: clip.duration })),
          frames,
        }),
      });
      const result = (await response.json()) as Analysis & { error?: string };
      if (!response.ok) throw new Error(result.error || "AI analysis failed.");

      const safeIndex = Math.min(result.selectedClipIndex, clips.length - 1);
      setSelectedClipIndex(safeIndex);
      setSegmentStart(result.start);
      setSegmentEnd(result.end);
      setTopText(result.topText);
      setBottomText(result.bottomText);
      setAnalysis({ ...result, selectedClipIndex: safeIndex });
      setCurrentTime(result.start);
      setMessage("Moment found. Review it, then export locally.");
      window.setTimeout(() => {
        const video = videoRef.current;
        if (video) video.currentTime = result.start;
      }, 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI analysis failed. Try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || !selectedClip) return;
    if (video.paused) {
      if (video.currentTime < segmentStart || video.currentTime >= segmentEnd) video.currentTime = segmentStart;
      await video.play();
    } else video.pause();
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
    drawFrame();
  };

  const exportReel = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !selectedClip || isExporting) return;
    const mimeTypes = ["video/mp4;codecs=h264", "video/webm;codecs=vp9", "video/webm"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    if (!mimeType) {
      setMessage("This browser cannot record the reel. Try Chrome or Safari.");
      return;
    }

    setIsExporting(true);
    setProgress(0);
    setMessage("Recording the selected moment locally…");
    video.pause();
    video.currentTime = segmentStart;
    await new Promise<void>((resolve) => video.addEventListener("seeked", () => resolve(), { once: true }));

    const canvasStream = canvas.captureStream(30);
    const captureVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    const audioTrack = captureVideo.captureStream?.().getAudioTracks()[0];
    if (audioTrack) canvasStream.addTrack(audioTrack);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      anchor.href = url;
      anchor.download = `sunday-sprinters-reel.${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setIsExporting(false);
      setProgress(100);
      setMessage(extension === "mp4" ? "MP4 exported. Ready for Instagram." : "Exported as WebM. Convert to MP4 before Instagram upload.");
    };
    const stopAtEnd = () => {
      if (video.currentTime >= segmentEnd || video.ended) {
        video.pause();
        video.removeEventListener("timeupdate", stopAtEnd);
        if (recorder.state !== "inactive") recorder.stop();
      }
    };
    video.addEventListener("timeupdate", stopAtEnd);
    recorder.start(500);
    await video.play();
  };

  return (
    <main className="reel-lab">
      <header className="masthead">
        <div className="brand">
          <span className="brand-name">SUNDAY SPRINTERS</span>
          <span className="brand-divider" />
          <span className="session-id">AI REEL LAB / 002</span>
        </div>
        <div className="local-status">LOCAL MEDIA <span className="status-dot" /></div>
      </header>

      <div className="workspace">
        <section className="editor-column" aria-label="Reel editor">
          <div className="intro">
            <p className="eyebrow">AI CUTS / YOU GET THE JOKE</p>
            <h1>DROP THE RIDE /<br />GET THE MEME.</h1>
            <p>Your full clips stay in this browser. Only small sampled frames are sent for AI analysis.</p>
          </div>

          <div className="step">
            <div className="step-label"><span>01 /</span>CLIPS</div>
            <div className="step-content">
              <div
                className={`dropzone ${isDragging ? "is-dragging" : ""} ${clips.length ? "has-file" : ""}`}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && inputRef.current?.click()}
              >
                <input ref={inputRef} type="file" accept="video/*" multiple onChange={onFileChange} hidden />
                <span className="upload-arrow">↑</span>
                <strong>{clips.length ? `${clips.length} CLIP${clips.length > 1 ? "S" : ""} READY` : "DROP CYCLING CLIPS HERE"}</strong>
                <span>{clips.length ? "REPLACE CLIPS" : "BROWSE FILES"}</span>
              </div>
              {clips.length > 0 && (
                <div className="clip-list">
                  {clips.map((clip, index) => (
                    <button
                      type="button"
                      key={`${clip.file.name}-${clip.file.lastModified}`}
                      className={selectedClipIndex === index ? "selected" : ""}
                      onClick={() => {
                        setSelectedClipIndex(index);
                        setSegmentStart(0);
                        setSegmentEnd(Math.min(8, clip.duration));
                        setAnalysis(null);
                      }}
                    >
                      <span>0{index + 1}</span>
                      <strong>{clip.file.name}</strong>
                      <small>{formatTime(clip.duration)}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="step ai-step">
            <div className="step-label"><span>02 /</span>AI CUT</div>
            <div className="step-content">
              <button className="analyze-button" type="button" onClick={analyzeClips} disabled={!clips.length || isAnalyzing}>
                <span>{isAnalyzing ? "ANALYZING MOMENTS…" : "FIND THE MEME MOMENT"}</span><span>✦</span>
              </button>
              {analysis && (
                <div className="analysis-card">
                  <span className="ai-badge">AI PICK · {Math.round(analysis.confidence * 100)}%</span>
                  <p>{analysis.reason}</p>
                  <div><span>CLIP 0{analysis.selectedClipIndex + 1}</span><span>{analysis.start.toFixed(1)}s — {analysis.end.toFixed(1)}s</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="step">
            <div className="step-label"><span>03 /</span>MEME</div>
            <div className="step-content fields">
              <label><span>TOP TEXT</span><div className="text-field"><input value={topText} maxLength={60} onChange={(event) => setTopText(event.target.value)} /><small>{topText.length} / 60</small></div></label>
              <label><span>BOTTOM TEXT</span><div className="text-field"><input value={bottomText} maxLength={60} onChange={(event) => setBottomText(event.target.value)} /><small>{bottomText.length} / 60</small></div></label>
              <div className="style-row">
                <div><span className="field-label">STYLE</span><div className="style-switcher">{(Object.keys(STYLE_LABELS) as StyleKey[]).map((key) => <button type="button" key={key} className={style === key ? "active" : ""} onClick={() => setStyle(key)}>{STYLE_LABELS[key]}</button>)}</div></div>
                <div className="timing"><span className="field-label">SELECTED MOMENT</span><span>{segmentStart.toFixed(1)}s — {segmentEnd.toFixed(1)}s</span><input aria-label="Video position" type="range" min={segmentStart} max={segmentEnd || 1} step="0.05" value={Math.min(Math.max(currentTime, segmentStart), segmentEnd)} onChange={(event) => seek(Number(event.target.value))} disabled={!selectedClip} /></div>
              </div>
            </div>
          </div>

          <div className="step export-step">
            <div className="step-label"><span>04 /</span>EXPORT</div>
            <div className="step-content">
              <button className="export-button" type="button" onClick={exportReel} disabled={!selectedClip || isExporting}><span>{isExporting ? `RECORDING ${Math.round(progress)}%` : "EXPORT REEL LOCALLY"}</span><span className="button-arrow">→</span></button>
              <p className="message" aria-live="polite">{message}</p>
              {analysis && <button className="copy-caption" type="button" onClick={() => navigator.clipboard.writeText(analysis.instagramCaption)}>COPY INSTAGRAM CAPTION</button>}
            </div>
          </div>
        </section>

        <aside className="preview-column" aria-label="Reel preview">
          <div className="preview-meta"><span>9:16</span><span>{(segmentEnd - segmentStart).toFixed(1)} SEC</span><span>1080 × 1920</span></div>
          <div className="canvas-shell"><canvas ref={canvasRef} width={540} height={960} /><button className="play-button" type="button" onClick={togglePlayback} disabled={!selectedClip} aria-label={isPlaying ? "Pause preview" : "Play preview"}>{isPlaying ? "Ⅱ" : "▶"}</button></div>
          <div className="preview-timeline"><span style={{ width: `${segmentEnd > segmentStart ? ((Math.min(Math.max(currentTime, segmentStart), segmentEnd) - segmentStart) / (segmentEnd - segmentStart)) * 100 : 0}%` }} /></div>
          <div className="preview-footer"><span>{selectedClip ? selectedClip.file.name : "NO CLIP"}</span><span>{style.toUpperCase()} CUT</span></div>
          {analysis && <div className="caption-preview"><span>POST CAPTION</span><p>{analysis.instagramCaption}</p></div>}
        </aside>
      </div>

      {selectedClip && (
        <video
          key={selectedClip.url}
          ref={videoRef}
          src={selectedClip.url}
          playsInline
          onLoadedData={(event) => { event.currentTarget.currentTime = segmentStart; setCurrentTime(segmentStart); drawFrame(); }}
          onPlay={() => { setIsPlaying(true); drawFrame(); }}
          onPause={() => { setIsPlaying(false); drawFrame(); }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            setCurrentTime(video.currentTime);
            if (!isExporting && video.currentTime >= segmentEnd) { video.pause(); video.currentTime = segmentStart; }
            if (isExporting && segmentEnd > segmentStart) setProgress(((video.currentTime - segmentStart) / (segmentEnd - segmentStart)) * 100);
          }}
          className="source-video"
        />
      )}
    </main>
  );
}
