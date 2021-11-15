import * as rxjs from "rxjs"
import {combineLatest, concatMap, fromEvent, map, mergeMap, Observable, zip} from "rxjs"
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

interface WebRtcMediaTime {
  id: string
  video: HTMLVideoElement
  mediaTime: number
  rtpTimestamp: number
}

function frameTimeRx(video: HTMLVideoElement, _id: string): Observable<WebRtcMediaTime> {
  return framerx(video).pipe(map((value: [HTMLVideoElement, number, any]) => {
    return {
      id: _id,
      video: video,
      mediaTime: value[2]["mediaTime"],
      rtpTimestamp: value[2]["rtpTimestamp"]
    }
  }));
}


function bothcanplayrx(): Observable<readonly unknown[]> {
  return rxjs.zip([fromEvent(facevideo, "canplay"), fromEvent(maskvideo, "canplay")]);
}

function bothplay() {
  return rxjs.zip([fromEvent(facevideo, "play"), fromEvent(maskvideo, "play")]);
}

const MAX_FACE_LATENCY = 3;
const canvasIdx: CircularBuffer = new CircularBuffer(MAX_FACE_LATENCY);
const maskTimes: CircularBuffer = new CircularBuffer(MAX_FACE_LATENCY);

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

function findNearestIndex(needle: number, haystack: number[]): number {
  let nearestdist = Number.MAX_VALUE;
  let nearestidx = 0;
  for (let i = 0; i < haystack.length; i++) {
    let dist = Math.abs(needle - haystack[i])
    if (dist < nearestdist) {
      nearestdist = dist;
      nearestidx = i;
    }
  }
  return nearestidx;
}

function main() {
  return bothplay().subscribe(x => {
    console.log("both playing", x);
    const whiteonblack = <HTMLCanvasElement>document.getElementById("whiteonblack");
    const whiteonblackctx = whiteonblack.getContext('2d')

    const blackonwhite = <HTMLCanvasElement>document.getElementById("blackonwhite");
    const blackonwhitectx = blackonwhite.getContext('2d')

    let maskFn = 0;
    let errorCount = 0;
    combineLatest([frameTimeRx(facevideo, "face"), frameTimeRx(maskvideo, "mask")]).subscribe(x => {
      let face = x.find(t => t.id == "face")
      let mask = x.find(t => t.id == "mask")

      if (maskTimes.get(0) != mask.rtpTimestamp) {
        maskTimes.enq(mask.rtpTimestamp);
        canvasIdx.enq(maskFn % MAX_FACE_LATENCY);
        let idx = canvasIdx.get(0)
        whiteonblacks[idx].ctx.drawImage(mask.video, 0, 0);
        blackonwhites[idx].ctx.drawImage(mask.video, 0, 0);

        maskFn++;
      }
      let maskTimesArray = maskTimes.toarray();
      let nearest = findNearestIndex(face.rtpTimestamp, maskTimesArray);
      blackonwhitectx.drawImage(blackonwhites[nearest].canvas, 0, 0);
      whiteonblackctx.drawImage(whiteonblacks[nearest].canvas, 0, 0);
      let maskRtpTime = maskTimesArray[nearest];
      let err = "none";
      if (face.rtpTimestamp > maskRtpTime) {
        err = "mask BEHIND face.";
      } else if (face.rtpTimestamp < maskRtpTime) {
        err = "face BEHIND mask.";
        errorCount++;
      }

      document.getElementById("facetimeindicator").innerHTML = `${hmsms(face.mediaTime)} sync err: ${err}`;
      document.getElementById("masktimeindicator").innerHTML = `${hmsms(mask.mediaTime)} ${maskRtpTime} lag: ${nearest} sync errors: ${errorCount * 100 / maskFn}%`;
    })
  });
}

main();