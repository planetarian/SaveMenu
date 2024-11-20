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

document.addEventListener("click", function (ev) {
    console.log(ev);
}, true);

var getBskyImageUrlData = function (url) {
    const regex = /^(?<pre>https?:\/\/)(?<domain>[\w-]+(?:\.[\w-]+)+)\/img\/feed_(?<size>fullsize|thumbnail)\/plain\/did:plc:(?<data1>\w+)\/(?<data2>\w+)@(?<type>jpe?g|png)(\?.*)?$/gi;
    const match = [...url.matchAll(regex)];
    if (!match?.length) return null;
    return match[0].groups;
};

var getBskyPostUrlData = function (url) {
    const regex = /^(?<pre>https?:\/\/)(?<domain>[\w-]+(?:\.[\w-]+)+)\/profile\/(?<user>[^\/]+)\/post\/(?<postId>\w+)$/gi;
    const match = [...url.matchAll(regex)];
    if (!match?.length) return null;
    return match[0].groups;
};

document.addEventListener("contextmenu", async function (ev) {
    const element = ev.target;
    let filename = null;
    console.log("Opened context menu.");
    if (!!ev.target.src) {
        
        // Bluesky has special handling due to being an annoying React app
        const bskyImageData = getBskyImageUrlData(ev.target.src);
        let container, bskyUser, bskyPostId, bskyImageIndex, bskyImageCount, els;
        if (!!bskyImageData) {
            console.log("Looks like a bsky post image. Looking for post info...");
            console.log(`data1: ${bskyImageData.data1}`);
            console.log(`data2: ${bskyImageData.data2}`);

            /*
            // check if we're in a post page
            let container = $("div[data-testid='postThreadScreen']");
            let els;
            let pageType = 'none';
            if (container.length) {
                pageType = 'post';
                console.log("Looks like we're on a post page.");
                els = container.find('div[data-testid^=postThreadItem]');
            }
            if (pageType === 'none') {
                // check if we're on a timeline
                container = $("div[data-testid='HomeScreen']");
                if (container.length) {
                    pageType = 'timeline';
                    console.log("Looks like we're on a timeline view.");
                    els = container.find('div[data-testid^=feedItem]');
                }
            }
            if (pageType === 'none') {
                // check if we're on a timeline
                container = $("div[data-testid='profileScreen']");
                if (container.length) {
                    pageType = 'profile';
                    console.log("Looks like we're on a profile view.");
                    els = container.find('div[data-testid^=feedItem]');
                }
            }
            if (pageType === 'none') {
                container = $("div[data-testid='convoScreen']");
                if (container.length) {
                    pageType = 'chat';
                    console.log("Looks like we're on a chat view.");
                    els = container.find('div[role=link]');
                }
            }
            if (pageType === 'none') {
                container = $("div[data-testid='searchScreen']");
                if (container.length) {
                    pageType = 'search';
                    console.log("Looks like we're on a search results view.");
                    els = container.find('div[role=link]');
                }
            }
            if (pageType === 'none') {*/
                //console.log("Couldn't determine the view type of the current page. Might be a feed?");
                container = $("main[role=main]");
                if (container.length) {
                    els = container.find('div[role=link], div[data-testid^=postThreadItem]');
                }
            //}
            if (!els?.length) {
                console.log("Couldn't find the items container for the current page.");
                return;
            }
            // Search through the list of posts present on this page for one containing the image in question
            for (let i = 0; i < els.length; i++) {
                const el = els[i];
                let user, postId;
                // If we're on a thread view, we can reference the URL
                if (document.URL.includes('/post/') && i == 0) {
                    var urlData = getBskyPostUrlData(document.URL);
                    if (!urlData) {
                        console.log("Invalid URL: " + document.URL);
                        return;
                    }
                    user = urlData.user;
                    postId = urlData.postId;
                }
                else {
                    // replies and posts to the timeline have the same basic structure
                    const links = $(el).find("a[href^='/profile/']");
                    for (const link of links) {
                        const urlData = getBskyPostUrlData(link.href);
                        if (!!urlData) {
                            user = urlData.user;
                            postId = urlData.postId;
                            break;
                        }
                    }
                }
                if (!user || !postId)
                    continue;

                // check the images in this post for the one we're looking at
                const images = $(el).find("img");
                let imageIdx = 0;
                for (const image of images) {
                    const imgData = getBskyImageUrlData(image.src);
                    if (!imgData) continue;
                    if (imgData.data1 == bskyImageData.data1 && imgData.data2 == bskyImageData.data2) {
                        bskyUser = user;
                        bskyPostId = postId;
                        bskyImageIndex = imageIdx;
                    }
                    imageIdx++;
                }
                if (bskyPostId) {
                    bskyImageCount = imageIdx;
                    break;
                }
            }

            if (bskyPostId) {
                filename = `bsky_${bskyUser}_${bskyPostId}`;
                if (bskyImageCount > 1)
                    filename += `_${bskyImageIndex+1}`;
                filename += ".png"
                
                console.log(`Found image post data. Filename: ${filename}`);
            }
            else {
                console.log("Couldn't find image post data.");
                return;
            }
        }
    }

    await chrome.runtime.sendMessage({ action: 'contextMenuOpened', element, filename });
}, true);
