import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaEl } from '../lib/capture';
import type { AppConfig } from '../types';

export type CameraStatus = 'off' | 'starting' | 'live' | 'error';

export interface CameraProblem {
  code: 'denied' | 'missing' | 'busy' | 'insecure' | 'unsupported' | 'disconnected' | 'stream' | 'unknown';
  title: string;
  detail: string;
}

const PROBLEMS: Record<CameraProblem['code'], Omit<CameraProblem, 'code'>> = {
  denied: {
    title: 'Camera access is blocked',
    detail: 'Allow the camera for this site in your browser settings, then try again.',
  },
  missing: { title: 'No camera found', detail: 'Connect a camera and try again. The closet and sample view still work.' },
  busy: { title: 'The camera is in use', detail: 'Another app is holding the camera. Close it and try again.' },
  insecure: {
    title: 'The camera needs a secure page',
    detail: 'Browsers only offer cameras on https or localhost. Open Aura at http://localhost or over https.',
  },
  unsupported: { title: 'This browser has no camera support', detail: 'Try a current version of Chrome, Edge, Safari or Firefox.' },
  disconnected: { title: 'The camera disconnected', detail: 'Check the connection and start it again.' },
  stream: {
    title: 'The camera stream is not answering',
    detail: 'Check the stream address and that the Pi is switched on.',
  },
  unknown: { title: 'The camera could not start', detail: 'Try again, or carry on with the sample view.' },
};

const problem = (code: CameraProblem['code']): CameraProblem => ({ code, ...PROBLEMS[code] });

function fromMediaError(error: unknown): CameraProblem {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return problem('denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return problem('missing');
  if (name === 'NotReadableError' || name === 'AbortError') return problem('busy');
  return problem('unknown');
}

/** Time allowed for a stream's first frame before reporting it as unavailable. */
const STREAM_TIMEOUT_MS = 8000;

export function useCamera(config: AppConfig['camera'] | undefined) {
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState<CameraProblem | null>(null);
  const [activeSource, setActiveSource] = useState<'browser' | 'stream' | null>(null);
  const [streamSrc, setStreamSrc] = useState<{ url: string; crossOrigin: boolean; key: number } | null>(null);
  const [captureBlocked, setCaptureBlocked] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const pollRef = useRef<number | undefined>(undefined);

  const clearPoll = () => {
    if (pollRef.current !== undefined) window.clearInterval(pollRef.current);
    pollRef.current = undefined;
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const stop = useCallback(() => {
    runRef.current += 1;
    clearPoll();
    releaseStream();
    setStreamSrc(null);
    setCaptureBlocked(false);
    setActiveSource(null);
    setStatus('off');
    setError(null);
  }, []);

  const startBrowser = useCallback(async (run: number) => {
    setActiveSource('browser');
    if (!window.isSecureContext) {
      setError(problem('insecure'));
      setStatus('error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(problem('unsupported'));
      setStatus('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (run !== runRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (run !== runRef.current) return;
        releaseStream();
        setError(problem('disconnected'));
        setStatus('error');
      });
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStatus('live');
    } catch (e) {
      if (run !== runRef.current) return;
      setError(fromMediaError(e));
      setStatus('error');
    }
  }, []);

  const watchStream = useCallback((run: number, url: string, crossOrigin: boolean) => {
    clearPoll();
    setStreamSrc({ url, crossOrigin, key: Date.now() });
    const startedAt = performance.now();
    // MJPEG streams do not reliably fire load, so watch for the first decoded frame.
    pollRef.current = window.setInterval(() => {
      if (run !== runRef.current) {
        clearPoll();
        return;
      }
      if ((imgRef.current?.naturalWidth ?? 0) > 0) {
        clearPoll();
        setStatus('live');
      } else if (performance.now() - startedAt > STREAM_TIMEOUT_MS) {
        clearPoll();
        setStreamSrc(null);
        setError(problem('stream'));
        setStatus('error');
      }
    }, 200);
  }, []);

  const start = useCallback(
    async (forceBrowser = false) => {
      const run = ++runRef.current;
      clearPoll();
      releaseStream();
      setStreamSrc(null);
      setCaptureBlocked(false);
      setError(null);
      setStatus('starting');
      if (!forceBrowser && config?.source === 'stream' && config.streamUrl) {
        setActiveSource('stream');
        watchStream(run, config.streamUrl, true);
        return;
      }
      await startBrowser(run);
    },
    [config, startBrowser, watchStream],
  );

  /**
   * A stream without CORS headers fails with crossOrigin set. It is retried once
   * without it: the picture shows, but its pixels cannot be captured or tracked.
   */
  const onStreamError = useCallback(() => {
    if (!streamSrc) return;
    if (streamSrc.crossOrigin) {
      setCaptureBlocked(true);
      watchStream(runRef.current, streamSrc.url, false);
    } else {
      clearPoll();
      setStreamSrc(null);
      setError(problem('stream'));
      setStatus('error');
    }
  }, [streamSrc, watchStream]);

  useEffect(
    () => () => {
      runRef.current += 1;
      clearPoll();
      releaseStream();
    },
    [],
  );

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      void el.play().catch(() => undefined);
    }
  }, []);

  const attachImage = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
  }, []);

  const getMedia = useCallback((): MediaEl | null => {
    if (activeSource === 'stream') return imgRef.current;
    return videoRef.current;
  }, [activeSource]);

  return {
    status,
    error,
    activeSource,
    streamSrc,
    captureBlocked,
    start,
    stop,
    attachVideo,
    attachImage,
    onStreamError,
    getMedia,
    live: status === 'live',
  };
}
