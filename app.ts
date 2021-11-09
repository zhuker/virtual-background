import * as rxjs from "rxjs"
import {fromEvent, mergeMap, map, Observable} from "rxjs"
import * as ops from "rxjs/operators"

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

let maskTime = -1;

let maskRtpTime = -1;

function bothcanplayrx(): Observable<readonly unknown[]> {
  return rxjs.zip([fromEvent(facevideo, "canplay"), fromEvent(maskvideo, "canplay")]);
}

function bothplay() {
  return rxjs.zip([fromEvent(facevideo, "play"), fromEvent(maskvideo, "play")]);
}

function debugEvents(v: HTMLMediaElement) {
  const events = [
    "abort",
    "canplay",
    "canplaythrough",
    "durationchange",
    "emptied",
    "ended",
    "error",
    "loadeddata",
    "loadedmetadata",
    "loadstart",
    "pause",
    "play",
    "playing",
    // "progress",
    "ratechange",
    "seeked",
    "seeking",
    "stalled",
    "suspend",
    // "timeupdate",
    "volumechange",
    "waiting"];
  return rxjs.from(events).pipe(mergeMap(eventname => fromEvent(v, eventname).pipe(map(e => [eventname, e]))))
}

// debugEvents(facevideo).subscribe(x => console.log('face', x));
// debugEvents(maskvideo).subscribe(x => console.log('mask', x));

function main() {
    return bothplay().subscribe(x => {
    console.log("both playing", x);
    const whiteonblack = <HTMLCanvasElement>document.getElementById("whiteonblack");
    const whiteonblackctx = whiteonblack.getContext('2d')

    const blackonwhite = <HTMLCanvasElement>document.getElementById("blackonwhite");
    const blackonwhitectx = blackonwhite.getContext('2d')
    blackonwhitectx.filter = 'invert(1)'

    framerx(maskvideo).subscribe((value: [HTMLVideoElement, number, any]) => {
      maskTime = value[2]["mediaTime"];
      maskRtpTime = value[2]["rtpTimestamp"];

      whiteonblackctx.drawImage(value[0], 0, 0);
      blackonwhitectx.drawImage(value[0], 0, 0);
    });
    framerx(facevideo).subscribe((value: [HTMLVideoElement, number, any]) => {
      let faceTime = value[2]["mediaTime"];
      let faceRtpTime = value[2]["rtpTimestamp"];
      if (maskTime != -1 && faceTime > (maskTime + 1 / 24)) {
        console.log("face is ahead of mask", faceTime, maskTime, Math.round((faceTime - maskTime) * 24));
      }

      if (maskTime != -1 && maskTime > (faceTime + 1 / 24)) {
        console.log("mask is ahead of face", faceTime, maskTime, Math.round((maskTime - faceTime) * 24), faceRtpTime, maskRtpTime);
      }
    });
  });
}

main();