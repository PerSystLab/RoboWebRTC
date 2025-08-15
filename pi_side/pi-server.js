cconst firebase = require('firebase/app');
require('firebase/firestore');
const { spawn } = require('child_process');
const wrtc = require('wrtc');
const http = require('http');
const fs = require('fs');

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDj4Je1fgQinxE3DNNknOHx6RYmxL91UZs",
    authDomain: "webtrc-6e0c6.firebaseapp.com",
    projectId: "webtrc-6e0c6",
    storageBucket: "webtrc-6e0c6.appspot.com",
    messagingSenderId: "908182701735",
    appId: "1:908182701735:web:e1c4035891ca801bbdbd82",
    measurementId: "G-WY9G38QHR0"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

// Session ID
const sessionId = "pi-stream-1";

// WebRTC configuration
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

// Create document references in Firestore
const piStreamDoc = firestore.collection('piStreams').doc(sessionId);
const offerCandidates = piStreamDoc.collection('offerCandidates');
const answerCandidates = piStreamDoc.collection('answerCandidates');

// Save and expose session ID
fs.writeFileSync('/tmp/stream-id.txt', sessionId);
console.log("====================================");
console.log(`STREAM ID: ${sessionId}`);
console.log("====================================");

// Simple HTTP server to expose session ID
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(`Current Stream ID: ${sessionId}`);
}).listen(8080);
console.log("Stream ID available at http://[pi-ip-address]:8080");

// Get Pi Camera stream using raspivid
async function getWebcamStream() {
    return new Promise((resolve, reject) => {
        const stream = new wrtc.MediaStream();
        const videoSource = new wrtc.nonstandard.RTCVideoSource();

        // Use raspivid to access Pi Camera
        // -t 0 means run indefinitely
        // -w/-h set resolution
        // -fps sets framerate
        // -o - outputs to stdout
        const raspivid = spawn('raspivid', [
            '-t', '0',                  // Run indefinitely
            '-w', '640',                // Width
            '-h', '480',                // Height
            '-fps', '30',               // Framerate
            '-b', '2000000',            // Bitrate (2Mbps)
            '-o', '-',                  // Output to stdout
            '-pf', 'baseline'           // H.264 baseline profile (more compatible)
        ]);

        // For newer Pi models using libcamera
        // const raspivid = spawn('libcamera-vid', [
        //   '-t', '0',
        //   '--width', '640',
        //   '--height', '480',
        //   '--framerate', '30',
        //   '--codec', 'h264',
        //   '--bitrate', '2000000',
        //   '-o', '-'
        // ]);

        // We need to convert H.264 stream to raw frames for WebRTC
        const ffmpeg = spawn('ffmpeg', [
            '-i', 'pipe:0',             // Input from stdin (raspivid's stdout)
            '-c:v', 'rawvideo',         // Output codec: raw video
            '-pix_fmt', 'yuv420p',      // Pixel format
            '-f', 'rawvideo',           // Force format
            'pipe:1'                    // Output to stdout
        ]);

        // Pipe raspivid output to ffmpeg input
        raspivid.stdout.pipe(ffmpeg.stdin);

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

        raspivid.stderr.on('data', (data) => {
            console.log(`raspivid: ${data}`);
        });

        ffmpeg.stderr.on('data', (data) => {
            console.log(`ffmpeg: ${data}`);
        });

        raspivid.on('error', (err) => {
            console.error('Failed to start raspivid:', err);
            reject(err);
        });

        // Add track to stream
        const videoTrack = videoSource.createTrack();
        stream.addTrack(videoTrack);

        resolve(stream);
    });
}

// The rest of the code is the same as before
// (startStreaming function, etc.)

// Start streaming
async function startStreaming() {
    console.log("Starting WebRTC stream server...");

    try {
        // Create peer connection
        const pc = new wrtc.RTCPeerConnection(servers);

        // Create data channel for stats
        const dataChannel = pc.createDataChannel("stats");
        dataChannel.onopen = () => console.log("Data channel opened");
        dataChannel.onmessage = (event) => {
            if (event.data.startsWith("ping:")) {
                const pingTime = event.data.split(":")[1];
                dataChannel.send("pong:" + pingTime);
            }
        };

        // Get webcam stream
        const stream = await getWebcamStream();
        console.log("Pi Camera stream ready");

        // Add tracks to peer connection
        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                offerCandidates.add(event.candidate.toJSON());
            }
        };

        // Create and set offer
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        await piStreamDoc.set({ offer });
        console.log("Offer created and saved to Firestore");

        // Listen for answers
        piStreamDoc.onSnapshot((snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                console.log("Received answer from browser");
                const answerDescription = new wrtc.RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
        });

        // Listen for client ICE candidates
        answerCandidates.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new wrtc.RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });

        console.log("Stream server ready. Connect using ID:", sessionId);

        // Save to a known location in Firebase for clients to find
        await firestore.collection('settings').doc('piCamera').set({
            activeStreamId: sessionId,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Handle shutdown
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