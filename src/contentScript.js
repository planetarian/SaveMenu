'use strict';

console.log("Initializing content script for SaveMenu");

var localDownload = async function (url, sender, sendResponse) {
    const res = await fetch(url);
    const imgBlob = await res.blob();
    const blobStr = URL.createObjectURL(imgBlob);

    sendResponse({ blobUrl: blobStr });
};


chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.action == "localDownload") {
            localDownload(request.url, sender, sendResponse).then(sendResponse);
        }
        return true;
    }
);