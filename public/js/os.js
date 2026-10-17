// Enhance download links without hiding alternatives or making any network requests.
// Phones, tablets and Chromebooks keep the generic desktop download choices.
(function () {
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var haystack = platform + ' ' + (navigator.userAgent || '');
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
