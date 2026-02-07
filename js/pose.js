const video5 = document.getElementsByClassName('input_video5')[0];
const out5 = document.getElementsByClassName('output5')[0];
const controlsElement5 = document.getElementsByClassName('control5')[0];
const canvasCtx5 = out5.getContext('2d');
document.querySelector('.input_video5').style.transform = 'scaleX(-1)'; //鏡像

const fpsControl = new FPS();

const spinner = document.querySelector('.loading');
spinner.ontransitionend = () => {
  spinner.style.display = 'none';
};

function zColor(data) {
  const z = clamp(data.from.z + 0.5, 0, 1);
  return `rgba(0, ${255 * z}, ${255 * (1 - z)}, 1)`;
}

//MIDI initialize

let output=null;

WebMidi.enable().then(() => {
  console.log("WebMidi enabled ✅");

  if (WebMidi.outputs.length === 0) {
    console.warn("⚠️ 沒有找到任何 MIDI 輸出裝置！");
  } else {
    WebMidi.outputs.forEach((output, index) => {
      console.log(`Output ${index}: ${output.name}`);
    });
    output = WebMidi.outputs[0]; // 🚨 指定要用的裝置
    console.log("🎹 選用輸出裝置：", output.name);
    
  }
});

//Stringd Chord
let currentChordIndex = 0;
const chords = [
  { name: "C", notes: ["C3", "G3", "E4", "G4", "E5"] },
  { name: "F", notes: ["F2", "C3", "A3", "F4", "C5"] },
  { name: "G", notes: ["G2", "D3", "B3", "G4", "D5"] },
  { name: "Em", notes: ["E3", "B3", "E4", "G4", "B4"] },
  { name: "Dm", notes: ["D3", "A3", "F4", "A4", "D5"] },
  { name: "Am", notes: ["A2", "E3", "C4", "E4", "C5"] },
];

let previousToeY = null;
let lastChordChangeTime = 0;

//記錄琴弦固定參數
let frozen = false;
let frozenCenter = null;
let frozenForward = null;
let frozenStringDir = null;
let frozenPedalCenter = null;

//fps參數
let lastFrameTime = Date.now();
let fpsSmoothing = 0.9;
let smoothedFps = 0;

//判斷腳與踏板是否接觸
let lastTriggerTime=0;
function checkPedalTrigger(results) {
  if (!results.poseLandmarks || !frozenPedalCenter) return false;

  const ankle = results.poseLandmarks[28]; // left ankle
  const dx = (ankle.x - frozenPedalCenter.x) * out5.width;
  const dy = (ankle.y - frozenPedalCenter.y) * out5.height;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const triggerRadius = 40; // 判定範圍
  const now = Date.now();
  const cooldown = 1000; // ms（1秒）

  if (distance < triggerRadius && now - lastTriggerTime > cooldown) {
    lastTriggerTime = now; // 更新時鐘
    return true;
  }
  return false;
}

//判斷撥弦
let lastStringTriggerTime=0;
let stringTriggerCooldown = 50; // 最少間隔 ms，避免連發
let fingerWasOnString = {}; // edge-trigger 狀態記錄

function checkStringTrigger(results) {
  if (!results.poseLandmarks || !frozenCenter || !frozenForward || !frozenStringDir) return;

  const now = Date.now();
  if (now - lastStringTriggerTime < stringTriggerCooldown) return;

  const fingerIndices = [19]; // 中指、小指
  const fingerPoints = fingerIndices.map(i => results.poseLandmarks[i]);

  const spacing = 0.05;
  const length = 0.5;
  const count = 5;
  const baseOffset = 0.2;

  for (let i = -Math.floor(count / 2); i <= Math.floor(count / 2); i++) {
    const px = frozenCenter.x + frozenForward.x * (spacing * i + baseOffset);
    const py = frozenCenter.y + frozenForward.y * (spacing * i + baseOffset);

    const x1 = px - frozenStringDir.x * length / 2;
    const y1 = py - frozenStringDir.y * length / 2;
    const x2 = px + frozenStringDir.x * length / 2;
    const y2 = py + frozenStringDir.y * length / 2;

    const hitboxMargin = 0.01; // 琴弦厚度
    const minX = Math.min(x1, x2) - hitboxMargin;
    const maxX = Math.max(x1, x2) + hitboxMargin;
    const minY = Math.min(y1, y2) - hitboxMargin;
    const maxY = Math.max(y1, y2) + hitboxMargin;

    for (let f = 0; f < fingerPoints.length; f++) {
      const finger = fingerPoints[f];
      const fingerID = fingerIndices[f];
      const stringID = i;

      const isInside = (
        finger.x >= minX && finger.x <= maxX &&
        finger.y >= minY && finger.y <= maxY
      );

      // 初始化狀態
      if (!fingerWasOnString[stringID]) fingerWasOnString[stringID] = {};
      if (fingerWasOnString[stringID][fingerID] === undefined) fingerWasOnString[stringID][fingerID] = false;

      const wasInside = fingerWasOnString[stringID][fingerID];

      // edge-trigger: 原本不在 → 現在在 → 播音
      if (!wasInside && isInside) {
        lastStringTriggerTime = now;

        const chord = chords[currentChordIndex];
        const noteIndex = i + Math.floor(count / 2);
        const note = chord.notes[noteIndex];

        if (output && note) {
          output.playNote(note, 1, { duration: 500 });
        }
        stringStates[noteIndex].brightness = 1.0;
        stringStates[noteIndex].offset = (Math.random() - 0.5) * 0.06;  // 小幅左右亂抖

        console.log(`Triggered string ${stringID} by finger ${fingerID}`);
      }
      // 更新狀態
      fingerWasOnString[stringID][fingerID] = isInside;
    }
  }
}

//琴弦初始狀態

const stringCount = 5;
let stringStates = [];

for (let i = 0; i < stringCount; i++) {
  stringStates.push({
    brightness: 0,       // 0 ~ 1
    offset: 0            // -max ~ +max
  });
}

function onResultsPose(results) {
  //FPS calculate
  const now = Date.now();
  const delta = now - lastFrameTime;
  const instantFps = 1000 / delta;
  smoothedFps = smoothedFps * fpsSmoothing + instantFps * (1 - fpsSmoothing);
  lastFrameTime = now;
  document.getElementById("fps").textContent = smoothedFps.toFixed(1);
  document.getElementById("currentChord").textContent = chords[currentChordIndex].name;
  document.getElementById("frozenStatus").textContent = frozen ? "true" : "false";


  if (!results.poseLandmarks) return;

  document.body.classList.add('loaded');
  fpsControl.tick();

  canvasCtx5.save();
  canvasCtx5.clearRect(0, 0, out5.width, out5.height);

  drawConnectors(
    canvasCtx5, results.poseLandmarks, POSE_CONNECTIONS, {
      color: (data) => {
        const x0 = out5.width * data.from.x;
        const y0 = out5.height * data.from.y;
        const x1 = out5.width * data.to.x;
        const y1 = out5.height * data.to.y;
        const z0 = clamp(data.from.z + 0.5, 0, 1);
        const z1 = clamp(data.to.z + 0.5, 0, 1);

        const gradient = canvasCtx5.createLinearGradient(x0, y0, x1, y1);
        gradient.addColorStop(0, `rgba(0, ${255 * z0}, ${255 * (1 - z0)}, 1)`);
        gradient.addColorStop(1.0, `rgba(0, ${255 * z1}, ${255 * (1 - z1)}, 1)`);
        return gradient;
      }
    });

  const importantIndices = [0,9,11,12,19,20,23,24,25,26,30,31,32,27,28];//顯示節點
  const filteredLandmarks = importantIndices //平滑計算
    .filter(index => results.poseLandmarks[index])
    .map(index => results.poseLandmarks[index]);
  drawLandmarks(canvasCtx5, filteredLandmarks, {
    color: '#FFFFFF',
    fillColor: '#FFD700',
    radius: 1
  });
  //計算身體中央並給出法向量
  const landmarks = results.poseLandmarks;
  const ls = landmarks[11]; // left shoulder
  const rs = landmarks[12]; // right shoulder
  const lh = landmarks[23]; // left hip
  const rh = landmarks[24]; // right hip

  if (ls && rs && lh && rh) {
    //身體正中心
    const center = {
      x: (ls.x + rs.x + lh.x + rh.x) / 4,
      y: (ls.y + rs.y + lh.y + rh.y) / 4,
      z: (ls.z + rs.z + lh.z + rh.z) / 4
    };
    //右肩差
    const right = {
      x: rs.x - ls.x,
      y: rs.y - ls.y,
      z: rs.z - ls.z
    };
    //脊椎長
    const down = {
      x: ((rh.x + lh.x) / 2 - (rs.x + ls.x) / 2),
      y: ((rh.y + lh.y) / 2 - (rs.y + ls.y) / 2),
      z: ((rh.z + lh.z) / 2 - (rs.z + ls.z) / 2)
    };
    //
    const forward = {
      x: right.y * down.z - right.z * down.y,
      y: right.z * down.x - right.x * down.z,
      z: right.x * down.y - right.y * down.x
    };

    //畫黃色法向量箭頭
    const scale = 0.6;
    canvasCtx5.beginPath();
    canvasCtx5.moveTo(center.x * out5.width, center.y * out5.height);
    canvasCtx5.lineTo((center.x + forward.x * scale) * out5.width, (center.y + forward.y * scale) * out5.height);
    canvasCtx5.strokeStyle = 'yellow';
    canvasCtx5.lineWidth = 4;
    canvasCtx5.stroke();
    
    // 計算 forward 與 stringDir
    const forwardLen = Math.sqrt(forward.x ** 2 + forward.y ** 2);
    const fx = forward.x / forwardLen;
    const fy = forward.y / forwardLen;

    let dx = (lh.x + rh.x) / 2 - (ls.x + rs.x) / 2;
    let dy = (lh.y + rh.y) / 2 - (ls.y + rs.y) / 2;
    const baseLen = Math.sqrt(dx * dx + dy * dy);
    dx /= baseLen;
    dy /= baseLen;

    const stringDir = { x: dx, y: dy };

    //畫弦之前，處理鎖定狀態
    let currentCenter, currentForward, currentStringDir;
    if (frozen) {
      currentCenter = frozenCenter;
      currentForward = frozenForward;
      currentStringDir = frozenStringDir;
    } else {
      frozenCenter = { ...center };
      frozenForward = { x: fx, y: fy }; // 注意：只存 2D 投影
      frozenStringDir = { ...stringDir };
      currentCenter = center;
      currentForward = { x: fx, y: fy };
      currentStringDir = stringDir;
    }

    //畫琴弦
    
    const spacing = 0.03;
    const length = 0.5;
    const count = 5;
    const baseOffset = 0.2;

    let px, py, ddx, ddy, dot, x1, x2, y1, y2;
    for (let i = -Math.floor(count / 2); i <= Math.floor(count / 2); i++) {
      const index = i + Math.floor(count / 2);

      // 亮度與震動 offset
      const brightness = stringStates[index]?.brightness || 0;
      const offset = stringStates[index]?.offset || 0;

      // 顏色由亮度決定
      const colorValue = Math.floor(100 + brightness * 155); // 100~255
      const color = `rgb(${colorValue}, ${colorValue}, ${colorValue})`;

      // 套用 offset（左右震動）
      px = currentCenter.x + currentForward.x * (spacing * i + baseOffset + offset);
      py = currentCenter.y + currentForward.y * (spacing * i + baseOffset);

      ddx = px - currentCenter.x;
      ddy = py - currentCenter.y;
      dot = ddx * currentForward.x + ddy * currentForward.y;
      if (dot < 0) continue;

      // 將 offset 加在畫弦兩端上，造成整條弦左右晃動
      x1 = (px - currentStringDir.x * length / 2) + offset * currentForward.y;
      y1 = (py - currentStringDir.y * length / 2) - offset * currentForward.x;
      x2 = (px + currentStringDir.x * length / 2) + offset * currentForward.y;
      y2 = (py + currentStringDir.y * length / 2) - offset * currentForward.x;


      canvasCtx5.beginPath();
      canvasCtx5.moveTo(x1 * out5.width, y1 * out5.height);
      canvasCtx5.lineTo(x2 * out5.width, y2 * out5.height);
      canvasCtx5.strokeStyle = color;
      canvasCtx5.lineWidth = 2.2;
      canvasCtx5.stroke();
    }

    //畫踏板
    if(frozen){
      pedalCenter=frozenPedalCenter;
    }else{
      const thirdStringOffset = spacing * 12; // 第三根琴弦的偏移距離
      pedalCenter = {
      x: center.x + down.x * 1.5 + forward.x * thirdStringOffset,
      y: center.y + down.y * 1.5 + forward.y * thirdStringOffset 
      }
      frozenPedalCenter = { ...pedalCenter };
    };
    const size = 30;
    canvasCtx5.beginPath();
    canvasCtx5.rect(
      pedalCenter.x * out5.width - size / 2,
      pedalCenter.y * out5.height - size / 2,
      size,
      size
    );
    canvasCtx5.fillStyle = "rgba(0, 255, 0, 0.3)";
    canvasCtx5.fill();
    canvasCtx5.strokeStyle = "green";
    canvasCtx5.lineWidth = 2;
    canvasCtx5.stroke();
    
    //判斷碰到踏板
    if (checkPedalTrigger(results)) {
      currentChordIndex = (currentChordIndex + 1) % chords.length;
    }
    //判斷手碰到琴弦
    checkStringTrigger(results);

    //顯示狀態
    if (frozen) {
      canvasCtx5.fillStyle = 'rgba(255,255,0,0.9)';
      canvasCtx5.font = '18px Arial';
      canvasCtx5.fillText('String Locked', 20, 30);
    }
  }
  //琴弦衰退
  for (let s of stringStates) {
    s.brightness *= 0.85;  // 漸暗
    s.offset *= 0.6;       // 收震
  }
  canvasCtx5.restore();
}


document.addEventListener('keydown', (e) => {
  if (e.key === 'f') {
    frozen = !frozen;
    console.log('琴弦鎖定狀態：', frozen);
  }
});


const pose = new Pose({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.2/${file}`;
}});
pose.onResults(onResultsPose);

const camera = new Camera(video5, {
  onFrame: async () => {
    await pose.send({image: video5});
  },
  width: 480,
  height: 480
});
camera.start();

new ControlPanel(controlsElement5, {
      selfieMode: true,
      upperBodyOnly: false,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    })
    .add([
      new StaticText({title: 'MediaPipe Pose'}),
      fpsControl,
      new Toggle({title: 'Selfie Mode', field: 'selfieMode'}),
      new Toggle({title: 'Upper-body Only', field: 'upperBodyOnly'}),
      new Toggle({title: 'Smooth Landmarks', field: 'smoothLandmarks'}),
      new Slider({
        title: 'Min Detection Confidence',
        field: 'minDetectionConfidence',
        range: [0, 1],
        step: 0.01
      }),
      new Slider({
        title: 'Min Tracking Confidence',
        field: 'minTrackingConfidence',
        range: [0, 1],
        step: 0.01
      }),
    ])
    .on(options => {
      video5.classList.toggle('selfie', options.selfieMode);
      pose.setOptions(options);
    });


document.addEventListener('keydown', (e) => {
  if (e.key === 'p') {
    if (output) {
      output.playNote("C4", 1, { duration: 500 });
      console.log("✅ 播放測試音 C4");
    } else {
      console.log("⚠️ output 尚未指定！");
    }
  }
});
