import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneIncoming,
  RefreshCw,
  Volume2,
  VolumeX,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { playRingtonePulse } from '../lib/sounds.ts';
import { Avatar } from './Avatar.tsx';

export interface ActiveCallSession {
  callId: number;
  direction: 'outgoing' | 'incoming';
  callType: 'audio' | 'video' | 'group_video';
  peerUserIds: number[];
  conversationId: number | null;
  displayName: string;
  avatarUrl: string | null;
  status: 'ringing' | 'connected';
}

interface CallOverlayProps {
  call: ActiveCallSession;
  onClose: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const CallOverlay: React.FC<CallOverlayProps> = ({ call, onClose }) => {
  const { sendWs, subscribeWs } = useAuth();
  const [status, setStatus] = useState<'ringing' | 'connected'>(call.status);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(call.callType === 'audio');
  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [seconds, setSeconds] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const durationRef = useRef(0);
  durationRef.current = seconds;

  const isVideo = call.callType === 'video' || call.callType === 'group_video';
  const primaryPeerId = call.peerUserIds[0];

  const stopMedia = () => {
    localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    for (const pc of pcsRef.current.values()) {
      pc.close();
    }
    pcsRef.current.clear();
  };

  const getOrCreatePeerConnection = (peerId: number): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcsRef.current.set(peerId, pc);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendWs('webrtc:ice', {
          targetUserId: peerId,
          callId: call.callId,
          candidate: ev.candidate,
        });
      }
    };

    pc.ontrack = (ev) => {
      if (remoteVideoRef.current && ev.streams[0]) {
        remoteVideoRef.current.srcObject = ev.streams[0];
      }
    };

    return pc;
  };

  const startLocalStream = async (facing: 'user' | 'environment') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { facingMode: facing } : false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch {
      setMediaError('Camera or microphone access unavailable. Audio/video simulated muted.');
      return null;
    }
  };

  useEffect(() => {
    let stopRing: (() => void) | null = null;
    if (status === 'ringing' && call.direction === 'incoming') {
      stopRing = playRingtonePulse();
    }
    return () => {
      if (stopRing) stopRing();
    };
  }, [status, call.direction]);

  useEffect(() => {
    if (status !== 'connected') return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (call.direction === 'outgoing') {
        await startLocalStream(facingMode);
        if (!mounted) return;
        for (const pid of call.peerUserIds) {
          const pc = getOrCreatePeerConnection(pid);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendWs('webrtc:offer', {
            targetUserId: pid,
            callId: call.callId,
            sdp: offer,
          });
        }
      }
    })();

    const unsub = subscribeWs(async (event, payload) => {
      if (Number(payload?.callId) !== call.callId) return;

      if (event === 'webrtc:offer') {
        const fromId = Number(payload.fromUserId);
        if (!localStreamRef.current) await startLocalStream(facingMode);
        const pc = getOrCreatePeerConnection(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWs('webrtc:answer', {
          targetUserId: fromId,
          callId: call.callId,
          sdp: answer,
        });
      } else if (event === 'webrtc:answer') {
        const fromId = Number(payload.fromUserId);
        const pc = getOrCreatePeerConnection(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        setStatus('connected');
        apiRequest(`/api/calls/${call.callId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ongoing' }),
        }).catch(() => {});
      } else if (event === 'webrtc:ice') {
        const fromId = Number(payload.fromUserId);
        const pc = pcsRef.current.get(fromId);
        if (pc && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
        }
      } else if (event === 'webrtc:accept') {
        setStatus('connected');
      } else if (event === 'webrtc:reject' || event === 'webrtc:hangup') {
        stopMedia();
        onClose();
      }
    });

    return () => {
      mounted = false;
      unsub();
      stopMedia();
    };
  }, []);

  const handleAccept = async () => {
    await startLocalStream(facingMode);
    setStatus('connected');
    sendWs('webrtc:accept', {
      targetUserId: primaryPeerId,
      callId: call.callId,
    });
    await apiRequest(`/api/calls/${call.callId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ongoing' }),
    }).catch(() => {});
  };

  const handleHangup = async (declined = false) => {
    const finalStatus = declined
      ? 'declined'
      : status === 'ringing' && call.direction === 'outgoing'
        ? 'missed'
        : 'ended';

    sendWs(declined ? 'webrtc:reject' : 'webrtc:hangup', {
      targetUserIds: call.peerUserIds,
      callId: call.callId,
    });

    await apiRequest(`/api/calls/${call.callId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: finalStatus,
        durationSeconds: durationRef.current,
      }),
    }).catch(() => {});

    stopMedia();
    onClose();
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((tr) => {
      tr.enabled = muted;
    });
    setMuted(!muted);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((tr) => {
      tr.enabled = cameraOff;
    });
    setCameraOff(!cameraOff);
  };

  const switchCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    localStreamRef.current?.getVideoTracks().forEach((tr) => tr.stop());
    const newStream = await navigator.mediaDevices
      .getUserMedia({ audio: true, video: { facingMode: next } })
      .catch(() => null);
    if (newStream) {
      localStreamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
      const newVideoTrack = newStream.getVideoTracks()[0];
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && newVideoTrack) sender.replaceTrack(newVideoTrack);
      }
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B141A] text-white flex flex-col justify-between p-6">
      {/* Top Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Lock className="w-3.5 h-3.5" />
          <span>End-to-end encrypted WebRTC</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-slate-300">
          {status === 'connected' ? formatDuration(seconds) : 'Ringing...'}
        </span>
      </div>

      {/* Video Stage / Avatar */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-4 rounded-3xl overflow-hidden bg-[#111B21] border border-slate-800">
        {isVideo && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={!speakerOn}
            className="w-full h-full object-cover"
          />
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {(!isVideo || status !== 'connected') && (
            <div className="flex flex-col items-center gap-4">
              <Avatar src={call.avatarUrl} name={call.displayName} size="xl" />
              <div className="text-center">
                <h2 className="text-2xl font-bold">{call.displayName}</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {status === 'ringing'
                    ? call.direction === 'incoming'
                      ? `Incoming ${call.callType.replace('_', ' ')} call`
                      : 'Calling...'
                    : `${call.callType.replace('_', ' ')} connected`}
                </p>
              </div>
            </div>
          )}
        </div>

        {isVideo && (
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-28 h-40 sm:w-36 sm:h-48 object-cover rounded-2xl border-2 border-white/20 shadow-xl absolute bottom-4 right-4 bg-black"
          />
        )}

        {mediaError && (
          <p className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/70 text-xs text-amber-300">
            {mediaError}
          </p>
        )}
      </div>

      {/* Call Controls */}
      <div className="flex items-center justify-center gap-4 pb-2">
        {status === 'ringing' && call.direction === 'incoming' ? (
          <>
            <button
              type="button"
              onClick={() => handleHangup(true)}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center transition-colors"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center transition-colors"
            >
              <PhoneIncoming className="w-6 h-6" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSpeakerOn(!speakerOn)}
              title="Speaker mode"
              className="w-12 h-12 rounded-full bg-[#202C33] hover:bg-[#2A3942] flex items-center justify-center"
            >
              {speakerOn ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-400" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                muted ? 'bg-white text-slate-900' : 'bg-[#202C33] hover:bg-[#2A3942]'
              }`}
            >
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            {isVideo && (
              <>
                <button
                  type="button"
                  onClick={toggleCamera}
                  title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    cameraOff
                      ? 'bg-white text-slate-900'
                      : 'bg-[#202C33] hover:bg-[#2A3942]'
                  }`}
                >
                  {cameraOff ? (
                    <VideoOff className="w-5 h-5" />
                  ) : (
                    <Video className="w-5 h-5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={switchCamera}
                  title="Switch camera"
                  className="w-12 h-12 rounded-full bg-[#202C33] hover:bg-[#2A3942] flex items-center justify-center"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => handleHangup(false)}
              title="End call"
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
