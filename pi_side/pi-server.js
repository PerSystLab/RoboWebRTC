const firebase = require('firebase/app');
require('firebase/firestore');
const { spawn } = require('child_process');
const wrtc = require('wrtc');
const http = require('http');
const fs = require('fs');

// Firebase config


firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

const sessionId = "pi-stream-1"; // Fixed ID for easier access

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const piStreamDoc = firestore.collection('piStreams').doc(sessionId);
const offerCandidates = piStreamDoc.collection('offerCandidates');
const answerCandidates = piStreamDoc.collection('answerCandidates');

fs.writeFileSync('/tmp/stream-id.txt', sessionId);
console.log("====================================");
console.log(`STREAM ID: ${sessionId}`);
console.log("====================================");

http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end(`Current Stream ID: ${sessionId}`);
}).listen(8080);
console.log("Stream ID available at http://[pi-ip-address]:8080");

async function getWebcamStream() {
  return new Promise((resolve, reject) => {
    const stream = new wrtc.MediaStream();

    const videoSource = new wrtc.nonstandard.RTCVideoSource();
    
    // Use ffmpeg to access USB webcam
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'v4l2',                // Video4Linux2 input
      '-framerate', '30',          // 30fps
      '-video_size', '640x480',    // Resolution
      '-i', '/dev/video0',         // USB webcam (might need to change this)
      '-c:v', 'rawvideo',          // Raw video codec
      '-pix_fmt', 'yuv420p',       // Pixel format
      '-f', 'rawvideo',            // Raw video output
      'pipe:1'                     // Output to stdout
    ]);

    ffmpeg.stdout.on('data', (data) => {
      // Create a frame from the raw video data
      const width = 640;
      const height = 480;
      const frame = {
        width: width,
        height: height,
        data: new Uint8Array(data),
        timestamp: Date.now()
      };
      
      // Send frame to WebRTC
      videoSource.onFrame(frame);
    });

    ffmpeg.stderr.on('data', (data) => {
      console.log(`ffmpeg: ${data}`);
    });

    ffmpeg.on('error', (err) => {
      console.error('Failed to start ffmpeg:', err);
      reject(err);
    });

    // Add track to stream
    const videoTrack = videoSource.createTrack();
    stream.addTrack(videoTrack);
    
    resolve(stream);
  });
}

async function startStreaming() {
  console.log("Starting WebRTC stream server...");

  try {
    const pc = new wrtc.RTCPeerConnection(servers);
    

    const dataChannel = pc.createDataChannel("stats");
    dataChannel.onopen = () => console.log("Data channel opened");
    dataChannel.onmessage = (event) => {
      if (event.data.startsWith("ping:")) {
        const pingTime = event.data.split(":")[1];
        dataChannel.send("pong:" + pingTime);
      }
    };

    const stream = await getWebcamStream();
    console.log("Webcam stream ready");

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        offerCandidates.add(event.candidate.toJSON());
      }
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await piStreamDoc.set({ offer });
    console.log("Offer created and saved to Firestore");

    piStreamDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        console.log("Received answer from browser");
        const answerDescription = new wrtc.RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    answerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new wrtc.RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    console.log("Stream server ready. Connect using ID:", sessionId);

    await firestore.collection('settings').doc('piCamera').set({
      activeStreamId: sessionId,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });

    process.on('SIGINT', () => {
      console.log("Shutting down stream...");
      pc.close();
      process.exit();
    });
  } catch (error) {
    console.error("Error starting stream:", error);
  }
}

// Start the streaming process
startStreaming();