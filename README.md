# RoboWebRTC

# WebRTC Firebase Demo

This project demonstrates a **peer-to-peer video call** web app using [WebRTC](https://webrtc.org/) for real-time media and [Firebase Firestore](https://firebase.google.com/products/firestore) for signaling. It also includes a simple **latency counter** using a WebRTC data channel.

---

## Features

- Start your webcam and microphone.
- Create a new call and share the session ID.
- Join a call from another browser or device using the session ID.
- Peer-to-peer video and audio streaming (WebRTC).
- Latency measurement between peers.
- Hang up to end the call.

---

## How It Works

- **Signaling:** Firestore is used to exchange connection info (SDP, ICE candidates) between peers.
- **Media:** Once connected, video/audio/data flows directly between browsers using WebRTC.
- **NAT Traversal:** Google STUN servers help peers connect across networks.
- **Latency:** A data channel sends "ping" and "pong" messages to measure round-trip time.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14+ recommended)
- [npm](https://www.npmjs.com/)
- A [Firebase project](https://console.firebase.google.com/) with Firestore enabled

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/webrtc-firebase-demo.git
   cd webrtc-firebase-demo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase:**
   - Replace the `firebaseConfig` object in `main.js` with your own Firebase project credentials.

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:5173](http://localhost:5173) in your browser.**

---

## Usage

1. **Start Webcam:** Click "Start webcam" to enable your camera and microphone.
2. **Create Call:** Click "Create Call (offer)" to generate a session ID. Copy this ID.
3. **Join Call:** Open another browser/device, paste the session ID, and click "Answer".
4. **Latency:** The latency counter shows round-trip time between peers.
5. **Hang Up:** Click "Hangup" to end the call.

---

## Security

- **Firestore Rules:** For testing, set your Firestore rules to allow read/write access.  
  **Do not use these rules in production!**
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
  ```

---

## Notes

- This demo uses Google STUN servers for NAT traversal.
- All signaling data is exchanged via Firestore; media/data is peer-to-peer.
- You can replace Firestore with any other signaling server (WebSocket, REST API, etc).

---

## License

MIT

---

## Credits

- [WebRTC](https://webrtc.org/)

