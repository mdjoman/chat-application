import { bus } from './event-bus';

import type {

  CallDTO,

  CallType,

  TurnCredentials,

} from '../types';

import type { ApiClient } from './api-client';

import type { SocketClient } from './socket-client';



interface CallUiState {

  call: CallDTO | null;

  direction: 'outgoing' | 'incoming' | null;

  localStream: MediaStream | null;

  remoteStreams: Map<number, MediaStream>; // userId → stream

  status: 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';

  micMuted: boolean;

  cameraOn: boolean;

  screenSharing: boolean;

  quality: { level: 'excellent' | 'good' | 'poor'; rtt: number; packetLoss: number };

}



type Listener = (state: CallUiState) => void;



const ICE_SERVERS_FALLBACK: RTCIceServer[] = [

  { urls: 'stun:stun.l.google.com:19302' },

];



export class CallController {

  private api: ApiClient;

  private socket: SocketClient;



  private state: CallUiState = {

    call: null,

    direction: null,

    localStream: null,

    remoteStreams: new Map(),

    status: 'idle',

    micMuted: false,

    cameraOn: true,

    screenSharing: false,

    quality: { level: 'excellent', rtt: 0, packetLoss: 0 },

  };



  private listeners = new Set<Listener>();

  private pcs = new Map<number, RTCPeerConnection>(); // peerUserId → connection

  private pendingCandidates = new Map<number, RTCIceCandidateInit[]>();

  private statsTimer: number | null = null;

  private heartbeatTimer: number | null = null;

  private iceServers: RTCIceServer[] = ICE_SERVERS_FALLBACK;



  constructor(api: ApiClient, socket: SocketClient) {

    this.api = api;

    this.socket = socket;

    this.bindSocket();

  }



  // ---------------------------------------------------------------------------

  // Public API

  // ---------------------------------------------------------------------------



  getState(): CallUiState {

    return this.state;

  }



  subscribe(listener: Listener): () => void {

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);

  }



  async startOutgoing(conversationId: number, callType: CallType): Promise<void> {

    if (this.state.call) return;



    // Fetch ephemeral TURN credentials + local media

    await this.refreshIceServers();

    const localStream = await this.getUserMedia(callType);

    this.patch({

      localStream,

      status: 'ringing',

      direction: 'outgoing',

      micMuted: false,

      cameraOn: callType === 'video',

    });



    // Initiate via REST (server emits socket events to us and callees)

    const call = await this.api.initiateCall({ conversationId, callType });

    this.patch({ call });



    // Ring timeout — if nobody accepts within N seconds, cancel.

    window.setTimeout(() => {

      if (this.state.call?.id === call.id && this.state.status === 'ringing') {

        void this.cancel();

      }

    }, 45_000);

  }



  async accept(): Promise<void> {

    const call = this.state.call;

    if (!call || this.state.direction !== 'incoming') return;



    await this.refreshIceServers();

    const localStream = await this.getUserMedia(call.callType);

    this.patch({ localStream });



    this.socket.socket?.emit('call:accept', { callId: call.id });



    // The caller will send us an offer once they get our \`call:accepted\`.

    // We wait for it in \`handleOffer\`.

  }



  async reject(): Promise<void> {

    const call = this.state.call;

    if (!call) return;

    this.socket.socket?.emit('call:reject', { callId: call.id });

    this.cleanupLocal();

  }



  async cancel(): Promise<void> {

    const call = this.state.call;

    if (!call) return;

    this.socket.socket?.emit('call:cancel', { callId: call.id });

    this.cleanupLocal();

  }



  async hangUp(): Promise<void> {

    const call = this.state.call;

    if (!call) return;

    this.socket.socket?.emit('call:end', { callId: call.id, reason: 'completed' });

    this.cleanupLocal();

  }



  toggleMic(): void {

    const s = this.state.localStream;

    if (!s) return;

    const track = s.getAudioTracks()[0];

    if (!track) return;

    track.enabled = !track.enabled;

    this.patch({ micMuted: !track.enabled });

    this.broadcastMediaState();

  }



  async toggleCamera(): Promise<void> {

    const s = this.state.localStream;

    if (!s) return;

    const track = s.getVideoTracks()[0];

    if (!track) return;

    track.enabled = !track.enabled;

    this.patch({ cameraOn: track.enabled });

    this.broadcastMediaState();

  }



  async switchCamera(): Promise<void> {

    // Mobile: cycle facingMode.

    const s = this.state.localStream;

    if (!s) return;

    const cur = s.getVideoTracks()[0];

    if (!cur) return;

    const currentFacing = cur.getSettings().facingMode ?? 'user';

    const nextFacing = currentFacing === 'user' ? 'environment' : 'user';

    const fresh = await navigator.mediaDevices.getUserMedia({

      audio: false,

      video: { facingMode: nextFacing },

    });

    const nextTrack = fresh.getVideoTracks()[0];

    if (!nextTrack) return;

    // Replace on all peer connections

    for (const [, pc] of this.pcs) {

      const sender = pc.getSenders().find((sn) => sn.track?.kind === 'video');

      if (sender) await sender.replaceTrack(nextTrack);

    }

    // Update local stream

    s.getVideoTracks().forEach((t) => s.removeTrack(t));

    s.addTrack(nextTrack);

    this.patch({ localStream: s });

  }



  // ---------------------------------------------------------------------------

  // Socket bindings

  // ---------------------------------------------------------------------------



  private bindSocket(): void {

    const socket = this.socket.socket;

    if (!socket) return;



    socket.on('call:incoming', (payload: { call: CallDTO; from: number }) => {

      // Only ring if we're not already in a call.

      if (this.state.call) {

        socket.emit('call:reject', { callId: payload.call.id, reason: 'busy' });

        return;

      }

      this.patch({

        call: payload.call,

        direction: 'incoming',

        status: 'ringing',

        remoteStreams: new Map(),

      });

      bus.emit('callIncoming', payload);

    });



    socket.on('call:ringing', (dto: CallDTO) => {

      // Our own outgoing call confirmed

      this.patch({ call: dto, direction: 'outgoing', status: 'ringing' });

    });



    socket.on('call:accepted', (payload: { callId: number; userId: number; call: CallDTO }) => {

      const call = this.state.call;

      if (!call || call.id !== payload.callId) return;

      this.patch({ call: payload.call, status: 'connecting' });



      // As the caller, initiate the offer to the accepted participant.

      void this.sendOfferTo(payload.userId);

    });



    socket.on('call:rejected', (payload: { callId: number; userId: number; reason: string }) => {

      const call = this.state.call;

      if (!call || call.id !== payload.callId) return;

      // In 1:1, the call is over.

      if (call.participants.filter((p) => p.role === 'callee').length <= 1) {

        this.patch({ status: 'ended' });

        this.cleanupLocal();

      } else {

        // In group, just remove this participant from our peer list.

        this.closePeer(payload.userId);

      }

    });



    socket.on('call:cancelled', (payload: { callId: number; byUserId: number }) => {

      const call = this.state.call;

      if (!call || call.id !== payload.callId) return;

      this.cleanupLocal();

    });



    socket.on('call:ended', (payload: { callId: number; byUserId: number; reason: string }) => {

      const call = this.state.call;

      if (!call || call.id !== payload.callId) return;

      this.cleanupLocal();

    });



    socket.on('call:offer', async (payload: { callId: number; fromUserId: number; sdp: string }) => {

      await this.handleOffer(payload.callId, payload.fromUserId, payload.sdp);

    });



    socket.on('call:answer', async (payload: { callId: number; fromUserId: number; sdp: string }) => {

      await this.handleAnswer(payload.fromUserId, payload.sdp);

    });



    socket.on('call:ice', async (payload: {

      callId: number;

      fromUserId: number;

      candidate: RTCIceCandidateInit;

    }) => {

      await this.handleIce(payload.fromUserId, payload.candidate);

    });



    socket.on('call:media-state', (payload: {

      callId: number;

      userId: number;

      micMuted?: boolean;

      cameraEnabled?: boolean;

      screenSharing?: boolean;

    }) => {

      // Update the participant's flags in our local view

      const call = this.state.call;

      if (!call) return;

      const updated: CallDTO = {

        ...call,

        participants: call.participants.map((p) =>

          p.userId === payload.userId

            ? {

                ...p,

                micMuted: payload.micMuted ?? p.micMuted,

                cameraEnabled: payload.cameraEnabled ?? p.cameraEnabled,

                screenSharing: payload.screenSharing ?? p.screenSharing,

              }

            : p,

        ),

      };

      this.patch({ call: updated });

    });



    socket.on('call:quality', (payload: { callId: number; userId: number; stats: Record<string, unknown> }) => {

      // Store incoming quality for remote peers if you want to render it.

      void payload;

    });

  }



  // ---------------------------------------------------------------------------

  // WebRTC internals

  // ---------------------------------------------------------------------------



  private async sendOfferTo(peerUserId: number): Promise<void> {

    const call = this.state.call;

    if (!call) return;



    const pc = await this.getOrCreatePeer(peerUserId);

    const offer = await pc.createOffer({

      offerToReceiveAudio: true,

      offerToReceiveVideo: call.callType === 'video',

    });

    await pc.setLocalDescription(offer);



    this.socket.socket?.emit('call:offer', {

      callId: call.id,

      toUserId: peerUserId,

      sdp: offer.sdp ?? '',

    });

  }



  private async handleOffer(callId: number, fromUserId: number, sdp: string): Promise<void> {

    const call = this.state.call;

    if (!call || call.id !== callId) return;



    // If we're the callee, we set state to 'connecting' on first offer.

    if (this.state.status === 'ringing') {

      this.patch({ status: 'connecting' });

    }



    const pc = await this.getOrCreatePeer(fromUserId);

    await pc.setRemoteDescription({ type: 'offer', sdp });



    // Flush any pending ICE candidates

    const queued = this.pendingCandidates.get(fromUserId) ?? [];

    for (const c of queued) {

      try { await pc.addIceCandidate(c); } catch { /* ignore */ }

    }

    this.pendingCandidates.delete(fromUserId);



    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer);



    this.socket.socket?.emit('call:answer', {

      callId,

      toUserId: fromUserId,

      sdp: answer.sdp ?? '',

    });

  }



  private async handleAnswer(fromUserId: number, sdp: string): Promise<void> {

    const pc = this.pcs.get(fromUserId);

    if (!pc) return;

    if (pc.signalingState === 'stable') return; // already applied

    await pc.setRemoteDescription({ type: 'answer', sdp });



    // Flush pending ICE

    const queued = this.pendingCandidates.get(fromUserId) ?? [];

    for (const c of queued) {

      try { await pc.addIceCandidate(c); } catch { /* ignore */ }

    }

    this.pendingCandidates.delete(fromUserId);

  }



  private async handleIce(fromUserId: number, candidate: RTCIceCandidateInit): Promise<void> {

    const pc = this.pcs.get(fromUserId);

    if (!pc || !pc.remoteDescription) {

      const q = this.pendingCandidates.get(fromUserId) ?? [];

      q.push(candidate);

      this.pendingCandidates.set(fromUserId, q);

      return;

    }

    try {

      await pc.addIceCandidate(candidate);

    } catch {

      /* ignore */

    }

  }



  private async getOrCreatePeer(peerUserId: number): Promise<RTCPeerConnection> {

    const existing = this.pcs.get(peerUserId);

    if (existing) return existing;



    const pc = new RTCPeerConnection({

      iceServers: this.iceServers,

      iceCandidatePoolSize: 4,

    });



    // Add local tracks

    const ls = this.state.localStream;

    if (ls) {

      for (const track of ls.getTracks()) {

        pc.addTrack(track, ls);

      }

    }



    // ICE candidate handler

    pc.onicecandidate = (e) => {

      if (!e.candidate) return;

      const call = this.state.call;

      if (!call) return;

      this.socket.socket?.emit('call:ice', {

        callId: call.id,

        toUserId: peerUserId,

        candidate: {

          candidate: e.candidate.candidate,

          sdpMid: e.candidate.sdpMid,

          sdpMLineIndex: e.candidate.sdpMLineIndex,

          usernameFragment: e.candidate.usernameFragment,

        },

      });

    };



    // Remote track handler

    pc.ontrack = (e) => {

      const [stream] = e.streams;

      if (!stream) return;

      const map = new Map(this.state.remoteStreams);

      map.set(peerUserId, stream);

      this.patch({ remoteStreams: map });

    };



    // Connection state

    pc.onconnectionstatechange = async () => {

      const call = this.state.call;

      if (!call) return;

      if (pc.connectionState === 'connected') {

        this.patch({ status: 'connected' });

        this.socket.socket?.emit('call:mark-connected', { callId: call.id });

        this.startStatsLoop();

        this.startHeartbeat();

      } else if (pc.connectionState === 'failed') {

        // Attempt ICE restart.

        try {

          const offer = await pc.createOffer({ iceRestart: true });

          await pc.setLocalDescription(offer);

          this.socket.socket?.emit('call:offer', {

            callId: call.id,

            toUserId: peerUserId,

            sdp: offer.sdp ?? '',

          });

        } catch {

          this.patch({ status: 'ended' });

          this.cleanupLocal();

        }

      }

    };



    this.pcs.set(peerUserId, pc);

    return pc;

  }



  private closePeer(peerUserId: number): void {

    const pc = this.pcs.get(peerUserId);

    if (pc) {

      pc.close();

      this.pcs.delete(peerUserId);

    }

    const map = new Map(this.state.remoteStreams);

    map.delete(peerUserId);

    this.patch({ remoteStreams: map });

  }



  private async refreshIceServers(): Promise<void> {

    try {

      const creds: TurnCredentials = await this.api.getTurnCredentials();

      this.iceServers = [

        {

          urls: creds.urls,

          username: creds.username,

          credential: creds.credential,

        },

      ];

    } catch {

      this.iceServers = ICE_SERVERS_FALLBACK;

    }

  }



  private async getUserMedia(callType: CallType): Promise<MediaStream> {

    return navigator.mediaDevices.getUserMedia({

      audio: {

        echoCancellation: true,

        noiseSuppression: true,

        autoGainControl: true,

      },

      video: callType === 'video'

        ? {

            width: { ideal: 1280 },

            height: { ideal: 720 },

            frameRate: { ideal: 30 },

          }

        : false,

    });

  }



  private broadcastMediaState(): void {

    const call = this.state.call;

    if (!call) return;

    this.socket.socket?.emit('call:media-state', {

      callId: call.id,

      micMuted: this.state.micMuted,

      cameraEnabled: this.state.cameraOn,

      screenSharing: this.state.screenSharing,

    });

  }



  private startStatsLoop(): void {

    if (this.statsTimer !== null) return;

    this.statsTimer = window.setInterval(async () => {

      const pc = [...this.pcs.values()][0];

      if (!pc) return;

      try {

        const stats = await pc.getStats();

        let rtt = 0, packetLoss = 0, inboundPackets = 0, lostPackets = 0;

        stats.forEach((r) => {

          if (r.type === 'candidate-pair' && (r as RTCIceCandidatePairStats).state === 'succeeded') {

            rtt = Math.max(rtt, Number((r as RTCIceCandidatePairStats).currentRoundTripTime ?? 0));

          }

          if (r.type === 'inbound-rtp') {

            const ir = r as RTCInboundRtpStreamStats;

            inboundPackets += Number(ir.packetsReceived ?? 0);

            lostPackets += Number(ir.packetsLost ?? 0);

          }

        });

        if (inboundPackets + lostPackets > 0) {

          packetLoss = lostPackets / (inboundPackets + lostPackets);

        }

        const level: 'excellent' | 'good' | 'poor' =

          rtt < 0.15 && packetLoss < 0.01 ? 'excellent' :

          rtt < 0.35 && packetLoss < 0.05 ? 'good' : 'poor';

        this.patch({ quality: { level, rtt, packetLoss } });

      } catch { /* ignore */ }

    }, 5_000);

  }



  private startHeartbeat(): void {

    if (this.heartbeatTimer !== null) return;

    this.heartbeatTimer = window.setInterval(() => {

      const call = this.state.call;

      if (!call) return;

      this.socket.socket?.emit('call:heartbeat', { callId: call.id });

    }, 15_000);

  }



  private cleanupLocal(): void {

    for (const [id] of this.pcs) this.closePeer(id);



    const ls = this.state.localStream;

    if (ls) {

      for (const t of ls.getTracks()) t.stop();

    }



    if (this.statsTimer !== null) {

      window.clearInterval(this.statsTimer);

      this.statsTimer = null;

    }

    if (this.heartbeatTimer !== null) {

      window.clearInterval(this.heartbeatTimer);

      this.heartbeatTimer = null;

    }



    this.patch({

      call: null,

      direction: null,

      localStream: null,

      remoteStreams: new Map(),

      status: 'idle',

      micMuted: false,

      cameraOn: true,

      screenSharing: false,

      quality: { level: 'excellent', rtt: 0, packetLoss: 0 },

    });

    this.pendingCandidates.clear();

  }



  private patch(patch: Partial<CallUiState>): void {

    this.state = { ...this.state, ...patch };

    this.listeners.forEach((l) => l(this.state));

  }

}