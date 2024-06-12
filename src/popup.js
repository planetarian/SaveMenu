'use strict';

import './popup.css';
import ko from 'knockout';
import ksb from 'knockout-secure-binding';

class ViewModel {
    constructor() {
        this.locationsDefault = { Downloads: "./" };

        // input text for defining save locations
        this.locationsText = ko.observable("");
        this.locationsTextIsValid = ko.computed(() => this.checkLocationsText(this.locationsText()));
        this.showLastDest = ko.observable(true);
        this.showSaveSuccess = ko.observable(false);

        // input text for manual replacements
        this.replacementsText = ko.observable("");
        this.replacementsTextIsValid = ko.computed(() => this.checkReplacementsText(this.replacementsText()));

        this.pixivRefreshToken = ko.observable("");
        this.pixivChallengeCode = ko.observable("");
        this.canSubmitChallengeCode = ko.computed(() => !!this.pixivChallengeCode());

        this.settingsAreValid = ko.computed(() => this.locationsTextIsValid() && this.replacementsTextIsValid());
    }


    async getChallengeCode() {
        await chrome.runtime.sendMessage({ action: 'getChallengeCode' });
    };
    async submitChallengeCode() {
        const { refreshToken } = await chrome.runtime.sendMessage({ action: 'getRefreshToken', code: this.pixivChallengeCode() });
        this.pixivRefreshToken(refreshToken);
    };

    checkLocationsText(locationsText) {
        if (!locationsText) {
            this.locationsText(JSON.stringify(this.locationsDefault, null, 2));
            return true;
        }
        try {
            let asJson = JSON.parse(locationsText);
            return !Array.isArray(asJson);
        }
        catch {
            return false;
        }
    };

    getReplacements(replacementsText) {
        const rep = replacementsText.trim();
        if (!rep) return [];

        const replacements = rep.split('\n').map(s => this.getReplacementParts(s.trim()));
        return replacements;
    };

    checkReplacementsText(replacementsText) {
        try {
            const replacements = this.getReplacements(replacementsText);
            return true;
        }
        catch (error) {
            return false;
        }
    };

    getReplacementsText(replacements) {
        if (!replacements) return '';
        return  replacements.map(r => `${r.target}=>${r.replacement}`).join('\n');
    }

    getReplacementParts(input) {
        const replacementRegex = /(?<target>.+)=>(?<replacement>.+)/i;
        if (!replacementRegex.test(input))
            throw new Error(`Replacement must be in the format target=>replacement. Invalid replacement: ${input}`);
        return input.match(replacementRegex).groups;
    };

    async loadSettings() {
        try {
            let data = await chrome.storage.local.get(
                ['locations', 'showLastDest', 'lastDest', 'replacements', 'pixivRefreshToken']);
            return data;
        }
        catch (error) {
            console.log("Error occurred while loading saved locations.\n" + error);
            return { _error_: error };
        }
    };

    async saveSettings() {
        if (!this.locationsTextIsValid()) {
            throw Error("Locations invalid.");
        }
        if (!this.replacementsTextIsValid()) {
            throw Error("Replacements invalid.");
        }
        try {
            const locations = this.locationsText();
            const replacements = this.getReplacements(this.replacementsText());
            await chrome.storage.local.set({
                showLastDest: this.showLastDest(),
                locations, replacements,
                pixivRefreshToken: this.pixivRefreshToken()
            });
            const settings = await this.loadSettings();
            await chrome.runtime.sendMessage({ action: 'settingsSaved', settings });
            this.showSaveSuccess(true);
            setTimeout(() => this.showSaveSuccess(false), 3 * 1000);
        }
        catch (error) {
            console.log("Error occurred while saving settings.\n" + error);
        }
    };
};

const initialize = async function () {
    const vm = new ViewModel();
    ko.applyBindings(vm, document.getElementById('root'));
    let settings = await vm.loadSettings();
    vm.locationsText(settings.locations);
    vm.showLastDest(settings.showLastDest);
    vm.replacementsText(vm.getReplacementsText(settings.replacements));
    vm.pixivRefreshToken(settings.pixivRefreshToken);
}

//await initialize();
$(document).ready(async () => {
    ko.bindingProvider.instance = new ksb();
    window.ko = ko;
    await initialize();
    console.log("initialized.");
});
