# RoboWebRTC

##Attention! This README file was written with help from a Generative AI model.

A minimal peer-to-peer video calling demo built with WebRTC for real-time media and Firebase Firestore for signaling. It includes a data channel to measure latency between peers.

---

## Features

- Start and preview your webcam and microphone.
- Create a call and share a session ID.
- Join an existing call using the session ID from another browser or device.
- Direct peer-to-peer audio/video streaming via WebRTC.
- Data channel–based round-trip latency measurement.
- Hang up to end the session and clean up resources.

---

## How it works

- Signaling: Connection metadata (SDP offers/answers and ICE candidates) is exchanged through Firebase Firestore.
- Media: After signaling, media streams flow directly between peers via WebRTC.
- NAT traversal: Google STUN servers are used to discover public-facing endpoints.
- Latency: A WebRTC data channel sends ping/pong messages to compute round-trip time.

---

## Prerequisites

- Node.js (v14+ recommended)
- npm
- A Firebase project with Firestore enabled

---

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/PerSystLab/RoboWebRTC.git
   cd RoboWebRTC
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Firebase:
   - In the Firebase console, create a project (or use an existing one).
   - Enable Firestore (Build > Firestore Database).
   - Add a Web app to obtain your Firebase config.
   - In the codebase, locate the `firebaseConfig` object (in `main.js`) and replace it with your project’s config.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:5173 in your browser.

---

## Usage

1. Start Webcam: Click “Start webcam” to allow camera and microphone access.
2. Create Call: Click “Create Call (offer)” to generate a session ID. Copy and share this ID.
3. Join Call: In another browser/device, paste the session ID and click “Answer.”
4. Latency: Watch the latency display for round-trip time between peers.
5. Hang Up: Click “Hangup” to end the call and release resources.

---



---

## Notes

- Uses Google STUN servers for NAT traversal.
- Only signaling data traverses Firestore; media and data channels are peer-to-peer.
- You can swap Firestore for a different signaling mechanism (e.g., WebSocket server, REST backend).

---

## Troubleshooting

- Camera/Mic blocked: Ensure you’ve granted permissions in the browser.
- Connection fails: Some networks with strict NAT/firewalls may block P2P. Consider adding TURN servers for reliability.
- Firestore not updating: Confirm Firestore is enabled and your `firebaseConfig` is correct.

---

## License

MIT

---

## Credits

- WebRTC (https://webrtc.org/)
- Firebase Firestore (https://firebase.google.com/products/firestore)
