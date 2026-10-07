/**
 * ============================================================
 * WEBRTC CONFIGURATION
 * ============================================================
 *
 * Purpose:
 *
 * Browser A
 *    ↓
 * RTCPeerConnection
 *    ↓
 * ICE Servers
 *    ├── STUN
 *    └── TURN
 *    ↓
 * Browser B
 *
 * Socket.IO is used only for signaling:
 *
 * offer
 * answer
 * ICE candidates
 *
 * Actual audio/video does NOT travel through Socket.IO.
 */

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

export interface WebRtcIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRtcConfig {
  iceServers: WebRtcIceServer[];
  iceCandidatePoolSize: number;
}

/**
 * ============================================================
 * ENV HELPERS
 * ============================================================
 */

function env(
  name: string,
): string | undefined {
  const value =
    process.env[name]?.trim();

  return value || undefined;
}

/**
 * Convert:
 *
 * STUN_URLS=
 * stun:stun1.example.com:3478,stun:stun2.example.com:3478
 *
 * into:
 *
 * [
 *   "stun:stun1.example.com:3478",
 *   "stun:stun2.example.com:3478"
 * ]
 */

function parseUrls(
  value: string | undefined,
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean);
}

/**
 * ============================================================
 * URL VALIDATION
 * ============================================================
 */

function validIceUrl(
  value: string,
): boolean {
  return (
    value.startsWith(
      'stun:',
    ) ||
    value.startsWith(
      'stuns:',
    ) ||
    value.startsWith(
      'turn:',
    ) ||
    value.startsWith(
      'turns:',
    )
  );
}

function validateUrls(
  urls: string[],
  label: string,
): string[] {
  for (
    const url of urls
  ) {
    if (
      !validIceUrl(url)
    ) {
      throw new Error(
        `${label} contains invalid ICE server URL: ${url}`,
      );
    }
  }

  return urls;
}

/**
 * ============================================================
 * STUN CONFIG
 * ============================================================
 *
 * Development fallback:
 *
 * Google public STUN.
 *
 * STUN does NOT relay media.
 * It helps browsers discover public network addresses.
 */

function getStunUrls(): string[] {
  const configured =
    parseUrls(
      env(
        'WEBRTC_STUN_URLS',
      ),
    );

  if (
    configured.length > 0
  ) {
    return validateUrls(
      configured,
      'WEBRTC_STUN_URLS',
    );
  }

  return [
    'stun:stun.l.google.com:19302',
  ];
}

/**
 * ============================================================
 * TURN CONFIG
 * ============================================================
 *
 * Production example:
 *
 * WEBRTC_TURN_URLS=
 * turn:turn.example.com:3478?transport=udp,
 * turn:turn.example.com:3478?transport=tcp,
 * turns:turn.example.com:5349?transport=tcp
 *
 * WEBRTC_TURN_USERNAME=chat-user
 * WEBRTC_TURN_CREDENTIAL=strong-secret
 */

function getTurnServer():
  | WebRtcIceServer
  | null {
  const urls =
    validateUrls(
      parseUrls(
        env(
          'WEBRTC_TURN_URLS',
        ),
      ),
      'WEBRTC_TURN_URLS',
    );

  if (
    urls.length === 0
  ) {
    return null;
  }

  const username =
    env(
      'WEBRTC_TURN_USERNAME',
    );

  const credential =
    env(
      'WEBRTC_TURN_CREDENTIAL',
    );

  /**
   * TURN without credentials is normally unusable and can
   * accidentally create an open relay depending on server
   * configuration.
   */

  if (
    !username ||
    !credential
  ) {
    throw new Error(
      'WEBRTC_TURN_URLS is configured but WEBRTC_TURN_USERNAME or WEBRTC_TURN_CREDENTIAL is missing.',
    );
  }

  return {
    urls:
      urls.length === 1
        ? urls[0]
        : urls,

    username,

    credential,
  };
}

/**
 * ============================================================
 * BUILD ICE SERVERS
 * ============================================================
 */

export function getIceServers(): WebRtcIceServer[] {
  const servers:
    WebRtcIceServer[] = [];

  /**
   * STUN
   */

  const stunUrls =
    getStunUrls();

  if (
    stunUrls.length > 0
  ) {
    servers.push({
      urls:
        stunUrls.length === 1
          ? stunUrls[0]
          : stunUrls,
    });
  }

  /**
   * TURN
   */

  const turn =
    getTurnServer();

  if (turn) {
    servers.push(
      turn,
    );
  }

  return servers;
}

/**
 * ============================================================
 * PUBLIC WEBRTC CONFIG
 * ============================================================
 *
 * This object is safe to send to an authenticated frontend.
 *
 * IMPORTANT:
 *
 * Static TURN credentials are included here when configured.
 * That is acceptable for an initial private deployment, but
 * production internet-facing systems should preferably use
 * short-lived TURN credentials.
 */

export function getWebRtcConfig(): WebRtcConfig {
  return {
    iceServers:
      getIceServers(),

    iceCandidatePoolSize:
      10,
  };
}

/**
 * ============================================================
 * TURN CONFIGURED?
 * ============================================================
 */

export function hasTurnServer(): boolean {
  return (
    parseUrls(
      env(
        'WEBRTC_TURN_URLS',
      ),
    ).length > 0
  );
}

/**
 * ============================================================
 * STARTUP VALIDATION
 * ============================================================
 *
 * Optional helper.
 *
 * Calling this during API startup makes invalid TURN config
 * fail early rather than discovering it during a call.
 */

export function validateWebRtcConfig(): void {
  getWebRtcConfig();
}

/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default {
  getIceServers,
  getWebRtcConfig,
  hasTurnServer,
  validateWebRtcConfig,
};
