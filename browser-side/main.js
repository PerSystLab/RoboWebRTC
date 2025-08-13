import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDj4Je1fgQinxE3DNNknOHx6RYmxL91UZs",
  authDomain: "webtrc-6e0c6.firebaseapp.com",
  projectId: "webtrc-6e0c6",
  storageBucket: "webtrc-6e0c6.appspot.com",
  messagingSenderId: "908182701735",
  appId: "1:908182701735:web:e1c4035891ca801bbdbd82",
  measurementId: "G-WY9G38QHR0"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

let pc = null;
let remoteStream = null;
let dataChannel = null;
let latencyInterval = null;
let latencyValues = [];

const connectButton = document.getElementById('connectButton');
const streamIdInput = document.getElementById('streamIdInput');
const remoteVideo = document.getElementById('remoteVideo');
const disconnectButton = document.getElementById('disconnectButton');
const latencyDisplay = document.getElementById('latency');
const connectionStatus = document.getElementById('connectionStatus');

async function loadDefaultStreamId() {
  try {
    const settingsDoc = await firestore.collection('settings').doc('piCamera').get();
    if (settingsDoc.exists) {
      const streamId = settingsDoc.data().activeStreamId;
      streamIdInput.value = streamId;
      console.log("Loaded default stream ID:", streamId);
    }
  } catch (error) {
    console.error("Error loading default stream ID:", error);
  }
}
loadDefaultStreamId();

// Connect to Pi
connectButton.onclick = async () => {
  const streamId = streamIdInput.value.trim();
  if (!streamId) {
    alert("Please enter a Stream ID");
    return;
  }
  
  connectionStatus.textContent = "Connecting...";
  
  // Init
  pc = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  
  const piStreamDoc = firestore.collection('piStreams').doc(streamId);
  const answerCandidates = piStreamDoc.collection('answerCandidates');
  const offerCandidates = piStreamDoc.collection('offerCandidates');

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    connectionStatus.textContent = "Connected - Receiving Video";
  };

  pc.ondatachannel = (event) => {
    dataChannel = event.channel;
    dataChannel.onopen = () => {
      console.log("Data channel opened");
      latencyInterval = setInterval(() => {
        if (dataChannel.readyState === 'open') {
          dataChannel.send("ping:" + Date.now());
        }
      }, 1000);
    };
    
    dataChannel.onmessage = (event) => {
      if (event.data.startsWith("pong:")) {
        const sent = parseInt(event.data.split(":")[1], 10);
        const latency = Date.now() - sent;
        latencyDisplay.textContent = latency;
        latencyValues.push(latency);
      }
    };
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      answerCandidates.add(event.candidate.toJSON());
    }
  };
  
  // Connection state changes
  pc.oniceconnectionstatechange = () => {
    console.log("ICE Connection State:", pc.iceConnectionState);
    if (pc.iceConnectionState === 'disconnected' || 
        pc.iceConnectionState === 'failed' || 
        pc.iceConnectionState === 'closed') {
      connectionStatus.textContent = "Disconnected";
      handleDisconnect();
    }
  };

  try {
    // offer  firestore
    const piStreamData = (await piStreamDoc.get()).data();

    if (!piStreamData || !piStreamData.offer) {
      connectionStatus.textContent = "Stream not found";
      alert("Stream ID not found or inactive!");
      return;
    }

    // Set the Pi's offer as remote description
    const offerDescription = piStreamData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    // Create answer
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };


    await piStreamDoc.update({ answer });

    // Listen for ICE candidates from the Pi
    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });

    disconnectButton.disabled = false;
    connectButton.disabled = true;
    
  } catch (error) {
    console.error("Error connecting to stream:", error);
    connectionStatus.textContent = "Connection Failed";
    alert("Failed to connect: " + error.message);
  }
};

// Disconn
disconnectButton.onclick = handleDisconnect;

function handleDisconnect() {
  if (latencyInterval) {
    clearInterval(latencyInterval);
    latencyInterval = null;
  }
  
  if (pc) {
    pc.close();
    pc = null;
  }

  if (latencyValues.length > 0) {
    const sum = latencyValues.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / latencyValues.length);
    console.log("Average latency:", avg, "ms");
  }

  remoteVideo.srcObject = null;
  remoteStream = null;
  connectionStatus.textContent = "Disconnected";
  disconnectButton.disabled = true;
  connectButton.disabled = false;
  latencyValues = [];
  latencyDisplay.textContent = "--";
}