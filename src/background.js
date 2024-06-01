'use strict';

import sanitize from 'sanitize-filename'
import qs from 'qs';
import sha256 from 'sha256';
import PixivApi from 'pixiv-api-client';
import axios from 'axios';
import fetchAdapter from '@haverstack/axios-fetch-adapter';
axios.defaults.adapter = fetchAdapter;

var extensionData = null;
var pixivClient = null;

var sleep = function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

var getSettings = async function () {
    try {
        const data = await chrome.storage.local.get(['locations', 'destinationMap', 'showLastDest', 'lastDest', 'pixivRefreshToken']);
        return data;
    }
    catch (error) {
        console.log("Error occurred while loading saved locations.\n" + error);
        return { _error_: error };
    }
};

var getFilenameOverride = function (url) {
    let filenameOverride = null;
    try {
        const twitterRegex = /(?<pre>https?:\/\/)(?:x|(?:(?:v|f)x)?twitter)\.com(?<post>\/(?<acc>\w+)\/status\/(?<id>\d+)(?:\/photo(?:\/(?<photonum>\d+)?)?)?)(?:\/en)*(?<query>(?:\?$|[a-zA-Z0-9\.\,\;\?\'\\\+&%\$\=~_\-\*]+))?(?<fragment>#[a-zA-Z0-9\-\.]+)?/gi;
        if (twitterRegex.test(url)) {
            const replace = function (match, pre, post, acc, id, photonum, query, fragment, rest) {
                if (!acc || !id) {
                    console.log("getFilenameOverride: Invalid input.");
                    return null;
                }
                return "twt_" + acc + "_" + id + (photonum > 1 ? "_" + photonum : "");
            }
            filenameOverride = url.replace(twitterRegex, replace);
        }

        if (filenameOverride)
            console.log("Derived: " + filenameOverride);
    }
    catch (err) {
        console.log("Error getting override:");
        console.log(err);
    }

    return filenameOverride;
};


var handleOnMenuClicked = async function (info, tab) {
    let url = null;
    let filenameOverride = null;

    if (info.pageUrl) {
        console.log("Page: " + info.pageUrl);
        url = info.pageUrl;
        filenameOverride = getFilenameOverride(info.pageUrl) || filenameOverride;
    }
    if (info.frameUrl) {
        console.log("Frame: " + info.frameUrl);
        url = info.frameUrl;
        filenameOverride = getFilenameOverride(info.frameUrl) || filenameOverride;
    }
    if (info.linkUrl) {
        console.log("Link: " + info.linkUrl);
        url = info.linkUrl;
        filenameOverride = getFilenameOverride(info.linkUrl) || filenameOverride;
    }
    if (info.srcUrl) {
        console.log("Src: " + info.srcUrl);
        url = info.srcUrl;
    }

    if (!url) return;

    const store = await getSettings();
    let dest = store.destinationMap[info.menuItemId];
    let finalUrl = url;
    let originalExtension = '';
    let forceExtension = '';

    let headers = null;
    
    let isTwitter = false;
    let isPixiv = false;
    let attemptingWithAltExt = false;
    const attempts = 3;
    let attempt = attempts;
    let filename = null;

    while (attempt > 0) {
        extensionData = await chrome.storage.local.get(['locations', 'lastDest', 'showLastDest', 'destMap', 'pixivRefreshToken']);

        // Twitter weirdness
        const oldTwitterRegex = /^(https?:\/\/\w+.twimg.com\/media\/\w+)\.(?<ext>jpg|png|jfif|webp):large$/;
        const oldTwitterMatch = url.match(oldTwitterRegex);
        if (oldTwitterMatch) {
            isTwitter = true;
            originalExtension = oldTwitterMatch.groups.ext;
            forceExtension = (attemptingWithAltExt ? originalExtension : 'png');
            finalUrl = url.replace(oldTwitterRegex, `$1?format=${forceExtension}&name=large`);
        }

        const newTwitterRegex = /^(https?:\/\/\w+\.twimg\.com\/media\/[\w_-]+)\?format=(?<ext>jpg|png|jfif|webp)&name=(\w+)$/;
        const newTwitterMatch = url.match(newTwitterRegex);
        if (newTwitterMatch) {
            isTwitter = true;
            forceExtension = 'png'
            originalExtension = newTwitterMatch.groups.ext;
            forceExtension = (attemptingWithAltExt ? originalExtension : 'png');
            finalUrl = url.replace(newTwitterRegex, `$1?format=${forceExtension}&name=large`);
        }

        const pximgRegex = /^(?:https?:\/\/(?<baseUrl>(?<pximg>i\.pximg\.net\/(?:c\/\d+x\d+_\d+\/)?img-\w+\/img\/(?:\d+\/){6})|(?<pixiv>(?:www\.)?pixiv\.net\/en\/artworks\/))(?<id>\d+)(?<imgsuffix>_p(?<page>\d+)(?:_\w+)?\.(?<ext>png|jpg|jpeg))?)$/;
        const pximgMatch = url.match(pximgRegex);
        if (filenameOverride) {
            filename = filenameOverride;
        }
        else if (pximgMatch) {

            isPixiv = true;
            //originalExtension = pximgMatch.groups.ext;
            //forceExtension = originalExtension;
            pixivClient = pixivClient || new PixivApi();
            const loginResult = await pixivClient.refreshAccessToken(store.pixivRefreshToken);
            //const loginResult = await pixivClient.login(store.pixivUser, store.pixivPassword);

            const { id, page } = pximgMatch.groups;
            const details = await pixivClient.illustDetail(id);

            const tags = details.illust.tags.slice(0,2).map(tag => tag.translated_name || tag.name).join(', ').substring(0, 30);

            const actualUrl = details.illust.meta_single_page.original_image_url || details.illust.meta_pages[page].image_urls.original;

            const originalExtension = actualUrl.substring(actualUrl.lastIndexOf('.')+1, actualUrl.length) || actualUrl;
            filename = `${tags} - ${details.illust.title} (${details.illust.user.account}) [${id}_p${page}].${originalExtension}`;

            var result = null;
            try {
                result = await chrome.tabs.sendMessage(tab.id, {action: 'localDownload', url: actualUrl});
            }
            catch (err) {
                console.log(err);
                return;
            }

            finalUrl = result.blobUrl;
        }
        else {
            //let filename = /^\w+:\/\/[^\/]+\/(?:.*?\/)*?([^?=\/\\]+\.\w{3,}(?!.*\.)|[\w-\.]+(?=$|\/mp4))/.exec(url);
            //let filename = /^\w+:\/\/[^\/]+\/(?:.*?\/)*?([^?=\/\\]+)(?:\?.*)?$/.exec(url);
            let filenameMatches = /^\w+:\/\/[^\/]+\/(?:.*?\/)*?([^?=\/\\]+)(?:\?.*)?$/i.exec(finalUrl);
            filename = filenameMatches;
            if (filename !== null && filename[1] !== null)
                filename = filename[1];
            
            if (!filename)
                filename = randomFilename64(32);
        }

        filename = sanitize(filename);

        // Decide upon destination folder and set file path/name
        if (dest == '.')
            dest = '';
        if (dest.startsWith('./'))
            dest = dest.substring(2);
        if (dest.length > 0 && !dest.endsWith("/"))
            dest = dest + "/";
        if (!!extensionData && dest !== extensionData.lastDest) {
            extensionData.lastDest = dest;
            await chrome.storage.local.set({ lastDest: dest });
            await chrome.contextMenus.removeAll();
            console.log("All menus removed");
        
            await generateContextMenus(extensionData);
        }
        const filePath = dest + filename + (forceExtension ? '.' + forceExtension : '');
        let downloadId = null;

        try {
            let searchResult, download = null;
            do {
                if (downloadId)
                    await chrome.downloads.erase({id: downloadId});
                const opts = { url: finalUrl, filename: filePath, headers };
                downloadId = await chrome.downloads.download(opts);
                console.log(downloadId);
                attempt--;
                
                let iter = 1000;
                do {
                    iter--;
                    searchResult = await chrome.downloads.search({id: downloadId});
                    download = searchResult[0]
                    if (!searchResult?.length) {
                        console.error(`No download for ID ${downloadId}`);
                    } else {
                        download = searchResult[0];
                    }
                    await sleep(100);
                } while (iter > 0 && searchResult?.length > 0 && download?.state === "in_progress");
                if (iter <= 0) {
                    console.error("Download exceeded wait time. ");
                }
                else if (download?.state === "interrupted") {
                    console.error("Download not completed.");
                }
                else if (download?.state === "complete") {
                    // Check for duplicate
                    const duplicateRegex = / \((?<id>\d+)\)\.\w+$/i;
                    const initDuplicateMatch = filePath.match(duplicateRegex);
                    const finalDuplicateMatch = download.filename.match(duplicateRegex);
                    if ((finalDuplicateMatch && !initDuplicateMatch)
                        || (finalDuplicateMatch && finalDuplicateMatch?.groups.id != initDuplicateMatch?.groups.id)) {
                        console.log(`Duplicate download detected; removing.`);
                        await chrome.downloads.removeFile(downloadId);
                    }
                    else {
                        console.log(`Saved file ${filePath}`);
                    }
                    return;
                }
                else {
                    console.error("Unknown status.");
                }
            }
            while (attempt > 0 && download?.canResume);
        }
        catch (error) {
            console.log("Couldn't download file.");
            console.log(error);
        }
        
        if (attempt === 0 && isTwitter && !attemptingWithAltExt) {
            attempt = attempts;
            attemptingWithAltExt = !attemptingWithAltExt;
        }
    }
};

var generateContextMenus = async function (data) {
    chrome.contextMenus.onClicked.removeListener(handleOnMenuClicked);

    console.log("Locations:");
    console.log(JSON.parse(data.locations));

    chrome.contextMenus.create({
        id: "saveMenu0",
        title: "Save",
        contexts: ["all"]
    });

    let state = { id: 0, destMap: {}, lastDest: data.showLastDest && data.lastDest };
    await populateSubMenu(state, 0, JSON.parse(data.locations));
    await chrome.storage.local.set({ destinationMap: state.destMap });

    chrome.contextMenus.onClicked.addListener(handleOnMenuClicked);
};

// construct submenu
let menuPrefix = "saveMenu";
var populateSubMenu = async function (state, parentId, myLocations) {
    if (parentId === 0 && !!state.lastDest) {
        console.log("Last destination: " + state.lastDest);
        let props = {
            id: menuPrefix + "999",
            title: /\/?([^\/]+)\/?$/.exec(state.lastDest)[1],
            contexts: ["all"],
            parentId: menuPrefix + parentId
        };
        state.destMap[props.id] = state.lastDest;
        chrome.contextMenus.create(props);
    }

    Object.keys(myLocations).forEach(key => {
        try {
            let loc = myLocations[key];
            let id = ++state.id;
            let props = {
                id: menuPrefix + id,
                title: key,
                contexts: ["all"],
                parentId: menuPrefix + parentId
            };
            state.destMap[props.id] = typeof (loc) === "string" ? loc : null;
            chrome.contextMenus.create(props);
            if (typeof (loc) !== "string") {
                populateSubMenu(state, id, loc);
            }
        }
        catch (err) {
            console.log("populateSubMenu: Error iterating myLocations: ");
            console.log(err);
        }
    });
};

var randomFilename64 = function (length) {
    let name = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    while (length--)
        name += chars[(Math.random() * chars.length | 0)];
    return name;
};

//
// Rebuild menu on settings saved
//

var handleSettingsSaved = async function (settings, sender, sendResponse) {
    if (!settings.locations)
        return;

    extensionData = settings;

    await chrome.contextMenus.removeAll();
    console.log("All menus removed");

    await generateContextMenus(extensionData);

    sendResponse({ success: true });
};

//
// Pixiv refresh tokens
//

var randomBytes = function (length) {
    const QUOTA = 65536;
    const a = new Uint8Array(length);
    for (var i = 0; i < length; i += QUOTA) {
        self.crypto.getRandomValues(a.subarray(i, i + Math.min(length - i, QUOTA)));
    }
    return a;
};

var toHexString = function (byteArray) {
    return Array.from(byteArray, function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('')
};

var generateToken = function (size = 16) {
    const data = randomBytes(size);
    return toHexString(data);
};

var codeVerifier, digest, codeChallenge, challengeTabId = 0;

var getRefreshToken = async function (code, sender, sendResponse) {
    if (!codeVerifier) {
        throw new Error("Code verifier not present; get a challenge code first.");
    }
    if (code.lastIndexOf('=') >= 0) {
        code = /code=(.*)$/.exec(code)[1];
    }
    pixivClient = pixivClient || new PixivApi();
    const result = await pixivClient.tokenRequest(code, codeVerifier);
    sendResponse({ refreshToken: result.refresh_token });
};

var getChallengeCode = async function (request, sender, sendResponse) {
    codeVerifier = generateToken(32);
    digest = sha256(codeVerifier, true);
    codeChallenge = btoa(digest).replace('+', '-').replace('/', '_').replace(/=$/, '');

    const params = qs.stringify({
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        client: "pixiv-android"
    });

    //const params = `code_challenge=${codeChallenge}&code_challenge_method=S256&client=pixiv-android`;
    const url = "https://app-api.pixiv.net/web/v1/login?" + params;
    
    //chrome.tabs.onUpdated.addListener(handleTabUpdated);
    const tab = await chrome.tabs.create({url, selected: true})
    challengeTabId = tab.id;
    console.log(tab);
    
    sendResponse({ tabOpened: true });
};

chrome.contextMenus.onClicked.addListener(handleOnMenuClicked);

//*
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action == "settingsSaved") {
        handleSettingsSaved(request.settings, sender, sendResponse).then(sendResponse);
    }
    else if (request.action == "getRefreshToken") {
        getRefreshToken(request.code, sender, sendResponse).then(sendResponse);
    }
    else if (request.action == "getChallengeCode") {
        getChallengeCode(request, sender, sendResponse).then(sendResponse);
    }
    else {
        console.log("Unhandled chrome.runtime.onMessage:");
        console.log(request.action);
    }
    return true;
});
//*/


//
// Installation
//

//*
chrome.runtime.onInstalled.addListener(() => {
    try {
        extensionData = getSettings().then(extensionData => {
            if (extensionData._error_) {
                console.log(extensionData._error_);
                return;
            }
            if (extensionData.locations)
                generateContextMenus(extensionData).then(()=> console.log("Context menus generated."));
        });
    }
    catch (err) {
        console.log("chrome.runtime.onInstalled.addListener: error adding listener:");
        console.log(err);
    }
});
//*/
