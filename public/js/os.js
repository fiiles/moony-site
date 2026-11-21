// Enhance download links without hiding alternatives or making any network requests.
// Android phones, tablets and Chromebooks keep the generic desktop download choices.
(function () {
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var haystack = platform + ' ' + (navigator.userAgent || '');
  if (/iphone|ipod/i.test(haystack)) {
    // An iPhone or iPod touch: buttons that carry an App Store address point there.
    document.querySelectorAll('[data-platform-link]').forEach(function (button) {
      if (!button.dataset.ios || !button.dataset.iosHref) return;
      var label = button.querySelector('span');
      if (label) label.textContent = button.dataset.ios;
      button.setAttribute('href', button.dataset.iosHref);
    });
    return;
  }
  var touchMac = /^mac/i.test(platform) && navigator.maxTouchPoints > 1;
  if (/android|cros|chrome os|iphone|ipad|ipod/i.test(haystack) || touchMac) return;
  var os = /^mac/i.test(platform) ? 'mac' : /^win/i.test(platform) ? 'win' : /linux/i.test(platform) ? 'linux' : '';
  if (!os) return;
  document.querySelectorAll('[data-platform-link]').forEach(function (button) {
    var label = button.querySelector('span');
    if (label && button.dataset[os]) label.textContent = button.dataset[os];
    button.setAttribute('href', button.getAttribute('href').split('#')[0] + '#' + os);
  });
  document.querySelectorAll('[data-os]').forEach(function (card) {
    if (card.dataset.os !== os) return;
    card.classList.add('is-current');
    var badge = card.querySelector('[data-current]');
    if (badge) badge.hidden = false;
  });
})();
