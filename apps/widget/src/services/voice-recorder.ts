export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private stopResolvers: Array<(r: Recording) => void> = [];

  async start(): Promise<void> {
    if (this.mediaRecorder) throw new Error('Already recording');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

    this.chunks = [];
    this.startedAt = performance.now();
    this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
    this.mediaRecorder.onstop = () => {
      const durationMs = Math.round(performance.now() - this.startedAt);
      const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
      const result: Recording = { blob, mimeType: blob.type || 'audio/webm', durationMs };
      this.stopResolvers.forEach((r) => r(result));
      this.stopResolvers = [];
      stream.getTracks().forEach((t) => t.stop());
      this.mediaRecorder = null;
    };

    this.mediaRecorder.start();
  }

  async stop(): Promise<Recording> {
    if (!this.mediaRecorder) throw new Error('Not recording');
    return new Promise<Recording>((resolve) => {
      this.stopResolvers.push(resolve);
      this.mediaRecorder!.stop();
    });
  }

  cancel(): void {
    if (!this.mediaRecorder) return;
    this.stopResolvers = [];
    this.mediaRecorder.onstop = null;
    try { this.mediaRecorder.stop(); } catch { /* ignore */ }
    this.mediaRecorder = null;
    this.chunks = [];
  }

  isRecording(): boolean { return this.mediaRecorder !== null; }
}
