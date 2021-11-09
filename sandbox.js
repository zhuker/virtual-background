const CircularBuffer = require("circular-buffer");

const canvasIdx = new CircularBuffer(3);
const maskTimes = new CircularBuffer(3);

const frameduration = 1 / 25;
let time = 0;
for (let fn = 0; fn < 6; fn++, time += frameduration) {
    console.log(fn, time)
    maskTimes.enq(time)
    canvasIdx.enq(fn % 3)
    console.log(canvasIdx.toarray())
    console.log(maskTimes.toarray())
}