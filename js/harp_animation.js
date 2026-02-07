// js/harp_animation.js
window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("harp-animation");
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // 弦設定
  const numStrings = 10;
  const strings = [];
  const spacing = 30;
  const baseX = 80;
  const topY = 40;
  const bottomY = 260;

  for (let i = 0; i < numStrings; i++) {
    strings.push({
      x: baseX + i * spacing,
      wave: 0,
      velocity: 0,
    });
  }

  let activeIndex = 0;
  let direction = 1;

  // 依序撥動每一根弦
  function pluckNextString() {
    strings[activeIndex].velocity = (Math.random() * 2 - 1) * 4; // 撥一下
    activeIndex += direction;
    if (activeIndex >= numStrings) {
      activeIndex = numStrings - 2;
      direction = -1;
    } else if (activeIndex < 0) {
      activeIndex = 1;
      direction = 1;
    }
  }
  setInterval(pluckNextString, 200); // 每 0.2 秒撥下一根弦

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let s of strings) {
      // 物理模擬：逐漸回到中心
      s.wave += s.velocity;
      s.velocity -= s.wave * 0.1; // 回復力
      s.velocity *= 0.92;         // 阻尼

      // 畫貝茲曲線（上下固定，中間偏移）
      ctx.beginPath();
      ctx.moveTo(s.x, topY);
      ctx.quadraticCurveTo(s.x + s.wave, (topY + bottomY) / 2, s.x, bottomY);

      const brightness = 0.6 + Math.abs(s.wave) / 20;
      ctx.strokeStyle = `rgba(${255 * brightness}, ${255 * brightness}, ${255 * brightness}, 0.9)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  draw();
});
