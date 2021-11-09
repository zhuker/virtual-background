import * as rxjs from "rxjs"
import {concatMap, fromEvent, map, mergeMap, Observable, zip} from "rxjs"
import * as CircularBuffer from "circular-buffer"

declare global {
  interface HTMLVideoElement {
    requestVideoFrameCallback(listener: (this: HTMLVideoElement, now: number, metadata: any) => any): MediaStream;
  }
}

console.log("hello world", Observable);
const facevideo = <HTMLVideoElement>document.getElementById("face")
const maskvideo = <HTMLVideoElement>document.getElementById("mask")

function framerx(video: HTMLVideoElement): Observable<[HTMLVideoElement, number, any]> {
  return new Observable(s => {
    let subscribed = true;
    let listener = (time, meta) => {
      s.next([video, time, meta])
      if (subscribed) {
        video.requestVideoFrameCallback(listener);
      }
    };
    video.requestVideoFrameCallback(listener);
    return () => subscribed = false;
  })
}

function bothcanplayrx(): Observable<readonly unknown[]> {
  return zip([fromEvent(facevideo, "loadedmetadata"), fromEvent(maskvideo, "loadedmetadata")]);
}

function onbothplay() {
  return zip([fromEvent(facevideo, "play"), fromEvent(maskvideo, "play")]);
}

function playboth() {
  return zip([rxjs.from(facevideo.play()), rxjs.from(maskvideo.play())]);
}

const playbutton = <HTMLButtonElement>document.getElementById("playbutton")
playbutton.onclick = () => {
  maskvideo.load();
  facevideo.load();
}

const MAX_FACE_LATENCY = 3;
const canvasIdx = new CircularBuffer(MAX_FACE_LATENCY);
const maskTimes = new CircularBuffer(MAX_FACE_LATENCY);

interface CanvasCtx {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

let whiteonblacks: CanvasCtx[] = []
let blackonwhites: CanvasCtx[] = []

for (let i = 0; i < MAX_FACE_LATENCY; i++) {
  const whiteonblack = <HTMLCanvasElement>document.createElement("canvas");
  whiteonblack.width = 800;
  whiteonblack.height = 532;
  const whiteonblackctx = whiteonblack.getContext('2d')
  whiteonblacks.push({canvas: whiteonblack, ctx: whiteonblackctx});

  const blackonwhite = <HTMLCanvasElement>document.createElement("canvas");
  blackonwhite.width = 800;
  blackonwhite.height = 532;
  const blackonwhitectx = blackonwhite.getContext('2d')
  blackonwhitectx.filter = 'invert(1)'
  blackonwhites.push({canvas: blackonwhite, ctx: blackonwhitectx});
}

function debugEvents(v: HTMLMediaElement) {
  const events = ["abort", "canplay", "canplaythrough", "durationchange", "emptied", "ended", "error", "loadeddata",
    "loadedmetadata", "loadstart", "pause", "play", "playing", "progress", "ratechange", "seeked", "seeking", "stalled",
    "suspend", "timeupdate", "volumechange", "waiting"];
  return rxjs.from(events).pipe(mergeMap(eventname => fromEvent(v, eventname).pipe(map(e => [eventname, e]))))
}

// debugEvents(facevideo).subscribe(x => console.log("face", x));
// debugEvents(maskvideo).subscribe(x => console.log("mask", x));

function hmsms(sec: number): string {
  let msec = Math.round(sec * 1000);
  let ms = (msec % 1000) | 0;
  let s = (sec % 60) | 0;
  let m = (sec % 3600 / 60) | 0;
  let h = (sec / 3600) | 0;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(ms).padStart(3, '0')}`;
}

function main() {
  bothcanplayrx().pipe(
    concatMap(x => {
      console.log("both videos canplay", x);
      return playboth()
    })
  ).subscribe(x => {
    console.log("both playing", x);
    const whiteonblack = <HTMLCanvasElement>document.getElementById("whiteonblack");
    const whiteonblackctx = whiteonblack.getContext('2d')

    const blackonwhite = <HTMLCanvasElement>document.getElementById("blackonwhite");
    const blackonwhitectx = blackonwhite.getContext('2d')

    let maskFn = 0;
    framerx(maskvideo).subscribe((value: [HTMLVideoElement, number, any]) => {
      let maskTime = value[2]["mediaTime"];
      document.getElementById("masktimeindicator").innerHTML = hmsms(maskTime);
      maskTimes.enq(maskTime);
      canvasIdx.enq(maskFn % MAX_FACE_LATENCY);
      maskFn++;
      let idx = canvasIdx.get(0)
      whiteonblacks[idx].ctx.drawImage(value[0], 0, 0);
      blackonwhites[idx].ctx.drawImage(value[0], 0, 0);
    });
    framerx(facevideo).subscribe((value: [HTMLVideoElement, number, any]) => {
      let faceTime = value[2]["mediaTime"];
      let mtimes = maskTimes.toarray();
      let nearestdist = Number.MAX_VALUE;
      let nearestidx = 0;
      for (let i = 0; i < mtimes.length; i++) {
        let dist = Math.abs(faceTime - mtimes[i])
        if (dist < nearestdist) {
          nearestdist = dist;
          nearestidx = i;
        }
      }
      let maskTime = mtimes[nearestidx];
      blackonwhitectx.drawImage(blackonwhites[nearestidx].canvas, 0, 0);
      whiteonblackctx.drawImage(whiteonblacks[nearestidx].canvas, 0, 0);

      let str = "";
      if (nearestidx != 0) {
        str = `!mask ${hmsms(maskTime)} is ahead of face ${hmsms(faceTime)} by ${Math.ceil(Math.abs(maskTime - faceTime) * 24)} frames`
        // console.log("!masktimes", mtimes, nearestidx)
      }

      if (maskTime != -1 && faceTime > (maskTime + 1 / 24)) {
        str = `mask ${hmsms(maskTime)} is behind of face ${hmsms(faceTime)} by ${Math.ceil(Math.abs(maskTime - faceTime) * 24)} frames`
        // console.log(str);
        // console.log("masktimes", mtimes, nearestidx)
      }

      if (maskTime != -1 && maskTime > (faceTime + 1 / 24)) {
        str = `mask ${hmsms(maskTime)} is ahead of face ${hmsms(faceTime)} by ${Math.ceil(Math.abs(maskTime - faceTime) * 24)} frames`
        // console.log(str);
        // console.log("masktimes", mtimes, nearestidx)
      }
      document.getElementById("facetimeindicator").innerHTML = hmsms(faceTime) + " " + str;
    });
  });
}

main();