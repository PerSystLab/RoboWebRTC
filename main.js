import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
apiKey: "YOUR_API_KEY",
authDomain: "YOUR_AUTH_DOMAIN",
databaseURL: "YOUR_DATABASE_URL",
projectId: "YOUR_PROJECT_ID",
storageBucket: "YOUR_STORAGE_BUCKET",
messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
appId: "YOUR_APP_ID"
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

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;
let dataChannel = null;
let latencyInterval = null;
let lastPingTime = 0;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const latencyDisplay = document.getElementById('latency');

// Webcam setup
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// Create call
callButton.onclick = async () => {
  // Reference Firestore collections
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      offerCandidates.add(event.candidate.toJSON());
    }
  };

  // Create data channel for latency
  dataChannel = pc.createDataChannel("latency");
  dataChannel.onopen = () => {
    latencyInterval = setInterval(() => {
      lastPingTime = Date.now();
      dataChannel.send("ping:" + lastPingTime);
    }, 1000);
  };
  dataChannel.onmessage = (event) => {
    if (event.data.startsWith("pong:")) {
      const sent = parseInt(event.data.split(":")[1], 10);
      const latency = Date.now() - sent;
      latencyDisplay.textContent = latency;
    }
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// Answer call
answerButton.onclick = async () => {
  const callId = callInput.value;
  console.log("Answering call with ID:", callId);
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      answerCandidates.add(event.candidate.toJSON());
    }
  };

  pc.ondatachannel = (event) => {
    dataChannel = event.channel;
    dataChannel.onopen = () => {
      latencyInterval = setInterval(() => {
        lastPingTime = Date.now();
        dataChannel.send("ping:" + lastPingTime);
      }, 1000);
    };
    dataChannel.onmessage = (event) => {
      if (event.data.startsWith("ping:")) {
        dataChannel.send("pong:" + event.data.split(":")[1]);
      } else if (event.data.startsWith("pong:")) {
        const sent = parseInt(event.data.split(":")[1], 10);
        const latency = Date.now() - sent;
        latencyDisplay.textContent = latency;
      }
    };
  };

  const callData = (await callDoc.get()).data();
  console.log("Fetched call data:", callData);

  if (!callData) {
    alert("Call ID not found!");
    return;
  }

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
  console.log("Set remote description");

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);
  console.log("Created and set local answer");

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });
  console.log("Updated Firestore with answer");

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  hangupButton.disabled = false;
};

// Hangup
hangupButton.onclick = () => {
  if (latencyInterval) clearInterval(latencyInterval);
  pc.close();
  window.location.reload();
};
