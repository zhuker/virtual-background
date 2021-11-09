var pc = null;

function negotiate() {
    pc.addTransceiver('video', {direction: 'recvonly'});
    pc.addTransceiver('video', {direction: 'recvonly'});
    pc.addTransceiver('audio', {direction: 'recvonly'});
    return pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer);
    }).then(function () {
        // wait for ICE gathering to complete
        return new Promise(function (resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }

                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function () {
        var offer = pc.localDescription;
        return fetch('/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then(function (response) {
        return response.text();
    }).then(function (answer) {
        console.log('answer', answer);
        return pc.setRemoteDescription(JSON.parse(answer));
    }).catch(function (e) {
        alert(e);
    });
}

function start() {
    var config = {
        sdpSemantics: 'unified-plan'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{urls: ['stun:stun.l.google.com:19302']}];
    }

    pc = new RTCPeerConnection(config);

    // connect audio / video
    pc.addEventListener('track', function (evt) {
        console.log('track', evt);
        if (document.getElementById('face').srcObject == null && evt.track.kind === 'video') {
            document.getElementById('face').srcObject = new MediaStream([evt.track]);
        } else if (document.getElementById('mask').srcObject == null && evt.track.kind === 'video') {
            document.getElementById('mask').srcObject = new MediaStream([evt.track]);
        } else {
            document.getElementById('audio').srcObject = new MediaStream([evt.track]);
        }
    });

    document.getElementById('start').style.display = 'none';
    negotiate();
    document.getElementById('stop').style.display = 'inline-block';
}

function stop() {
    document.getElementById('stop').style.display = 'none';

    // close peer connection
    setTimeout(function () {
        pc.close();
    }, 500);
}
