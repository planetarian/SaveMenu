'use strict';

import './popup.css';
import ko from 'knockout';
import ksb from 'knockout-secure-binding';

class ViewModel {
    constructor() {
        this.locationsDefault = { Downloads: "./" };

        this.locationsText = ko.observable("");
        this.showLastDest = ko.observable(true);
        this.showSaveSuccess = ko.observable(false);

        this.pixivRefreshToken = ko.observable("");
        this.pixivChallengeCode = ko.observable("");
        this.canSubmitChallengeCode = ko.computed(() => !!this.pixivChallengeCode());
        
        this.locationsTextIsValid = ko.computed(() => !!this.checkLocationsText());
        this.settingsAreValid = ko.computed(() => !!this.locationsTextIsValid());
    }
  

  async getChallengeCode () {
      await chrome.runtime.sendMessage({action: 'getChallengeCode'});
  };
  async submitChallengeCode () {
      const { refreshToken } = await chrome.runtime.sendMessage({action: 'getRefreshToken', code: this.pixivChallengeCode()});
      this.pixivRefreshToken(refreshToken);
  };

  checkLocationsText () {
      if (!this.locationsText()) {
          this.locationsText(JSON.stringify(this.locationsDefault, null, 2));
          return true;
      }
      try {
          let asJson = JSON.parse(this.locationsText());
          return !Array.isArray(asJson);
      }
      catch {
          return false;
      }
  };

  async loadSettings () {
      try {
          let data = await chrome.storage.local.get(['locations', 'showLastDest', 'lastDest', 'pixivRefreshToken']);
          return data;
      }
      catch (error) {
          console.log("Error occurred while loading saved locations.\n" + error);
          return { _error_: error };
      }
  };
  
  async saveSettings () {
      if (!this.locationsTextIsValid()) {
          throw Error("Locations not valid.");
      }
      try {
          let locations = this.locationsText();
          await chrome.storage.local.set({
              showLastDest: this.showLastDest(),
              locations,
              pixivRefreshToken: this.pixivRefreshToken()
          });
          const settings = await this.loadSettings();
          await chrome.runtime.sendMessage({action: 'settingsSaved', settings});
          this.showSaveSuccess(true);
          setTimeout(() => this.showSaveSuccess(false), 3*1000);
      }
      catch (error) {
          console.log("Error occurred while saving settings.\n" + error);
      }
  };
};

const initialize = async function() {
    const vm = new ViewModel();
    ko.applyBindings(vm, document.getElementById('root'));
    let settings = await vm.loadSettings();
    vm.locationsText(settings.locations);
    vm.showLastDest(settings.showLastDest);
    vm.pixivRefreshToken(settings.pixivRefreshToken);
}

//await initialize();
$(document).ready(async () => {
    ko.bindingProvider.instance = new ksb();
    window.ko = ko;
    await initialize();
    console.log("initialized.");
});
